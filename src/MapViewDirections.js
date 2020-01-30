/* eslint-disable react/jsx-closing-bracket-location */
/* eslint-disable no-console */
/* eslint-disable comma-dangle */
/* eslint-disable no-unused-vars */
/* eslint-disable react/no-array-index-key */
/* eslint-disable react/jsx-no-bind */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MapView from 'react-native-maps';
import isEqual from 'lodash.isequal';

class MapViewDirections extends Component {

	constructor(props) {
		super(props);

		this.state = {
			routes: [{
				coordinates: [],
				distance: null,
				duration: null,
				durationInTraffic: null,
			}]
		};
	}

	componentDidMount() {
		this._mounted = true;
		this.fetchAndRenderRoute(this.props);
	}

	componentWillUnmount() {
		this._mounted = false;
	}

	componentWillReceiveProps(nextProps) {
		if (!isEqual(nextProps.origin, this.props.origin) || !isEqual(nextProps.destination, this.props.destination) || !isEqual(nextProps.waypoints, this.props.waypoints) || !isEqual(nextProps.mode, this.props.mode) || !isEqual(nextProps.restrictions, this.props.restrictions)) {
			if (nextProps.resetOnChange === false) {
				this.fetchAndRenderRoute(nextProps);
			} else {
				this.resetState(() => {
					this.fetchAndRenderRoute(nextProps);
				});
			}
		}
	}

	resetState = (cb = null) => {
		this._mounted && this.setState({
			coordinates: null,
			distance: null,
			duration: null,
			durationInTraffic: null,
		}, cb);
	}

	selectRoute = (selectedIndex) => {
		const newRoutes = this.state.routes;
		const selectedRoute = newRoutes[selectedIndex];
		newRoutes.splice(selectedIndex, 1);
		newRoutes.push(selectedRoute);
		this.setState(newRoutes);
	}

	decode(t, e) {
		for (var n, o, u = 0, l = 0, r = 0, d = [], h = 0, i = 0, a = null, c = Math.pow(10, e || 5); u < t.length;) {
			a = null, h = 0, i = 0;
			do a = t.charCodeAt(u++) - 63, i |= (31 & a) << h, h += 5; while (a >= 32);
			n = 1 & i ? ~(i >> 1) : i >> 1, h = i = 0;
			do a = t.charCodeAt(u++) - 63, i |= (31 & a) << h, h += 5; while (a >= 32);
			o = 1 & i ? ~(i >> 1) : i >> 1, l += n, r += o, d.push([l / c, r / c]);
		}

		return d = d.map((t) => {
			return {
				latitude: t[0],
				longitude: t[1],
			};
		});
	}

	fetchAndRenderRoute = (props) => {

		let {
			origin,
			destination,
			waypoints,
			apikey,
			onStart,
			onReady,
			onPress,
			onError,
			mode = 'driving',
			language = 'en',
			optimizeWaypoints,
			directionsServiceBaseUrl = 'https://maps.googleapis.com/maps/api/directions/json',
			region,
			durationInTraffic,
			restrictions = [],
			alternativeRoute = false,
		} = props;

		if (!origin || !destination) {
			return;
		}

		if (origin.latitude && origin.longitude) {
			origin = `${origin.latitude},${origin.longitude}`;
		}

		if (destination.latitude && destination.longitude) {
			destination = `${destination.latitude},${destination.longitude}`;
		}

		if (!waypoints || !waypoints.length) {
			waypoints = '';
		} else {
			waypoints = waypoints
				.map(waypoint => (waypoint.latitude && waypoint.longitude) ? `${waypoint.latitude},${waypoint.longitude}` : waypoint)
				.join('|');
		}

		if (optimizeWaypoints) {
			waypoints = `optimize:true|${waypoints}`;
		}

		onStart && onStart({
			origin,
			destination,
			waypoints: waypoints ? waypoints.split('|') : [],
		});

		this.fetchRoute(directionsServiceBaseUrl, origin, waypoints, destination, apikey, mode, language, region, durationInTraffic, restrictions, alternativeRoute)
			.then(result => {
				if (!this._mounted) return;
				this.setState(result);
				onReady && onReady(result);
			})
			.catch(errorMessage => {
				this.resetState();
				console.warn(`MapViewDirections Error: ${errorMessage}`); // eslint-disable-line no-console
				onError && onError(errorMessage);
			});
	}

	fetchRoute(directionsServiceBaseUrl, origin, waypoints, destination, apikey, mode, language, region, durationInTraffic, restrictions, alternativeRoute) {

		// Define the URL to call. Only add default parameters to the URL if it's a string.
		let url = directionsServiceBaseUrl;
		if (typeof (directionsServiceBaseUrl) === 'string') {
			url += `?origin=${origin}&waypoints=${waypoints}&destination=${destination}&key=${apikey}&mode=${mode}&language=${language}&region=${region}`;
		}

		// If "departure_time" is set, Google API will iclude "duration_in_traffic" property into the response data.
		if (durationInTraffic) {
			url += `&departure_time=now`;
		}

		if (restrictions.length > 0) {
			url += `&avoid=${restrictions.join('|')}`;
		}

		if (alternativeRoute === true) {
			url += `&alternatives=true`;
		}

		console.log(url);

		return fetch(url)
			.then(response => response.json())
			.then(json => {

				if (json.status == 'ZERO_RESULTS') {
					return Promise.resolve({
						coordinates: [],
					});
				}

				if (json.status !== 'OK') {
					const errorMessage = json.error_message || 'Unknown error';
					return Promise.reject(errorMessage);
				}

				if (json.routes.length) {
					const routes = json.routes.map((route) => {
						return {
							distance: {
								// value = meter
								meter: route.legs.reduce((carry, curr) => {
									return carry + curr.distance.value;
								}, 0),
							},
							duration: {
								// value = second
								second: route.legs.reduce((carry, curr) => {
									return carry + curr.duration.value;
								}, 0),
							},
							coordinates: this.decode(route.overview_polyline.points),
							durationInTraffic: {
								// value = second
								second: route.legs.reduce((carry, curr) => {
									if (!curr.duration_in_traffic) {
										return;
									}
									return carry + curr.duration_in_traffic.value;
								}, 0),
							},
							fare: route.fare,
							steps: route.legs.reduce((carry, curr) => {
								return [...carry, ...curr.steps];
							}, []),
						};
					});

					// The best route should be the last element to optimize polylines.
					routes.reverse();

					return Promise.resolve({
						routes
					});

				} else {
					return Promise.reject();
				}
			})
			.catch(err => {
				console.warn(
					'react-native-maps-directions Error on GMAPS route request',
					err
				);
			});
	}

	render() {
		if (this.state.routes.length == 0) {
			return null;
		}

		const {
			origin, // eslint-disable-line no-unused-vars
			waypoints, // eslint-disable-line no-unused-vars
			destination, // eslint-disable-line no-unused-vars
			apikey, // eslint-disable-line no-unused-vars
			onReady, // eslint-disable-line no-unused-vars
			onPress, // added by Omi.
			onError, // eslint-disable-line no-unused-vars
			mode, // eslint-disable-line no-unused-vars
			language, // eslint-disable-line no-unused-vars
			region,
			durationInTraffic, // added by Omi.
			restrictions, // added by Omi.
			...props
		} = this.props;

		return (
			this.state.routes.map((route, index) => {
				const newProps = { ...props };
				// The last polyline is the selected route.
				if (index != this.state.routes.length - 1) {
					newProps.strokeColor = "#a9a9a9";
				}
				return <MapView.Polyline
					key={index}
					coordinates={route.coordinates}
					tappable={true}
					onPress={() => {
						this.selectRoute(index);
						onPress(route);
					}}
					{...newProps}
				/>;
			})
		);
	}

}

MapViewDirections.propTypes = {
	origin: PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.shape({
			latitude: PropTypes.number.isRequired,
			longitude: PropTypes.number.isRequired,
		}),
	]),
	waypoints: PropTypes.arrayOf(
		PropTypes.oneOfType([
			PropTypes.string,
			PropTypes.shape({
				latitude: PropTypes.number.isRequired,
				longitude: PropTypes.number.isRequired,
			}),
		]),
	),
	destination: PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.shape({
			latitude: PropTypes.number.isRequired,
			longitude: PropTypes.number.isRequired,
		}),
	]),
	apikey: PropTypes.string.isRequired,
	onStart: PropTypes.func,
	onReady: PropTypes.func,
	onPress: PropTypes.func,
	onError: PropTypes.func,
	mode: PropTypes.oneOf(['', 'driving', 'bicycling', 'transit', 'walking']),
	language: PropTypes.string,
	resetOnChange: PropTypes.bool,
	optimizeWaypoints: PropTypes.bool,
	directionsServiceBaseUrl: PropTypes.string,
	region: PropTypes.string,
	durationInTraffic: PropTypes.bool,
	restrictions: PropTypes.array,
	alternativeRoute: PropTypes.bool,
};

export default MapViewDirections;
