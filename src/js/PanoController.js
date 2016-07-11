/**
 * -------
 * threeVR (https://github.com/richtr/threeVR)
 * -------
 *
 * W3C Device Orientation control (http://www.w3.org/TR/orientation-event/)
 * with manual user drag (rotate) and pinch (zoom) override handling
 *
 * Author: Rich Tibbett (http://github.com/richtr)
 * License: The MIT License
 *
**/
var PanoController = function ( object, domElement, startAngle) {

	startAngle = startAngle || -90;

	this.object = object;
	this.element = domElement || document;

	this.freeze = true;

	this.enableManualDrag = true; // enable manual user drag override control by default
	this.enableManualZoom = true; // enable manual user zoom override control by default

	this.useQuaternions = true; // use quaternions for orientation calculation by default

	this.deviceOrientation = {};
	this.screenOrientation = window.orientation || 0;

	this.os = '';
	if(!!navigator.userAgent.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/)){
			this.os = 'ios';
	}else{
			this.os = (navigator.userAgent.indexOf('Android') > -1 || navigator.userAgent.indexOf('Linux')) ? 'android' : '';
	}


	// Manual rotate override components
	var startX = 0, startY = 0,
	    currentX = 0, currentY = 0,
	    scrollSpeedX, scrollSpeedY,
	    tmpQuat = new THREE.Quaternion();

	// Manual zoom override components
	var zoomStart = 1, zoomCurrent = 1,
	    zoomP1 = new THREE.Vector2(),
	    zoomP2 = new THREE.Vector2(),
	    tmpFOV;
	var zoomFactor = 0, minZoomFactor = 1,maxZoomFactor =0.3,tmpZoom = 1; // maxZoomFactor = Infinity

	var CONTROLLER_STATE = {
		AUTO: 0,
		MANUAL_ROTATE: 1,
		MANUAL_ZOOM: 2
	};

	var appState = CONTROLLER_STATE.AUTO;

	var CONTROLLER_EVENT = {
		CALIBRATE_COMPASS:  'compassneedscalibration',
		SCREEN_ORIENTATION: 'orientationchange',
		MANUAL_CONTROL:     'userinteraction', // userinteractionstart, userinteractionend
		ZOOM_CONTROL:       'zoom',            // zoomstart, zoomend
		ROTATE_CONTROL:     'rotate',          // rotatestart, rotateend
	};

	// Consistent Object Field-Of-View fix components
	var startClientHeight = window.innerHeight,
	    startFOVFrustrumHeight = 2000 * Math.tan( THREE.Math.degToRad( ( this.object.fov || 75 ) / 2 ) ),
	    relativeFOVFrustrumHeight, relativeVerticalFOV;

	var deviceQuat = new THREE.Quaternion();

	// white ++
	var isDown = false;
	var camera = object;

	var cameraRadius = 500;
	var cameraTarget = new THREE.Vector3();
	var cameraMaxLat = 85;
	var cameraLerp = 0.2;

	var drag = {lon:startAngle, lat:0};  //拖动 经纬度
	var fix  = {lon:0, lat:0};  //消除 误差
	var gyro  = {lon:0, lat:0};  //陀螺仪 经纬度

	// set camera target with lon & lat  经纬度
	var setCameraByLatLon = function(){
		var newTarget = new THREE.Vector3();

		return function(lon,lat){
			var phi = THREE.Math.degToRad( 90 - lat );
			var theta = THREE.Math.degToRad( lon );

			newTarget.x = cameraRadius * Math.sin( phi ) * Math.cos( theta );
			newTarget.y = cameraRadius * Math.cos( phi );
			newTarget.z = cameraRadius * Math.sin( phi ) * Math.sin( theta );

			cameraTarget.lerp(newTarget,cameraLerp);

			camera.lookAt( cameraTarget );
		};

	}();

	var fireEvent = function () {
		var eventData;

		return function ( name ) {
			eventData = arguments || {};

			eventData.type = name;
			eventData.target = this;

			this.dispatchEvent( eventData );
		}.bind( this );
	}.bind( this )();

	this.constrainObjectFOV = function () {
		relativeFOVFrustrumHeight = startFOVFrustrumHeight * ( window.innerHeight / startClientHeight );

		relativeVerticalFOV = THREE.Math.radToDeg( 2 * Math.atan( relativeFOVFrustrumHeight / 2000 ) );

		this.object.fov = relativeVerticalFOV;
	}.bind( this );

	this.onDeviceOrientationChange = function ( event ) {
		this.deviceOrientation = event;
	}.bind( this );

	this.onScreenOrientationChange = function () {
		this.screenOrientation = window.orientation || 0;

		fireEvent( CONTROLLER_EVENT.SCREEN_ORIENTATION );
	}.bind( this );

	this.onCompassNeedsCalibration = function ( event ) {
		event.preventDefault();

		fireEvent( CONTROLLER_EVENT.CALIBRATE_COMPASS );
	}.bind( this );

	this.onDocumentMouseDown = function ( event ) {
		if ( this.enableManualDrag !== true ) return;

		event.preventDefault();

		appState = CONTROLLER_STATE.MANUAL_ROTATE;

		this.freeze = true;
		isDown = true;

		tmpQuat.copy( this.object.quaternion );

		startX = currentX = event.pageX;
		startY = currentY = event.pageY;

		// Set consistent scroll speed based on current viewport width/height
		scrollSpeedX = ( 1200 / window.innerWidth ) * 0.2;
		scrollSpeedY = ( 800 / window.innerHeight ) * 0.2;

		this.element.addEventListener( 'mousemove', this.onDocumentMouseMove, false );
		this.element.addEventListener( 'mouseup', this.onDocumentMouseUp, false );

		fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'start' );
		fireEvent( CONTROLLER_EVENT.ROTATE_CONTROL + 'start' );
	}.bind( this );

	this.onDocumentMouseMove = function ( event ) {

		if(isDown){
			var movex = event.pageX - currentX;
			var movey = event.pageY - currentY;
			drag.lon = (drag.lon - scrollSpeedX * event.movementX) % 360;
	    drag.lat = Math.max(-cameraMaxLat, Math.min(cameraMaxLat, drag.lat + scrollSpeedY * event.movementY));
		}

		currentX = event.pageX;
		currentY = event.pageY;

		// console.log(drag.lat);

	}.bind( this );

	this.onDocumentMouseUp = function ( event ) {
		this.element.removeEventListener( 'mousemove', this.onDocumentMouseMove, false );
		this.element.removeEventListener( 'mouseup', this.onDocumentMouseUp, false );

		appState = CONTROLLER_STATE.AUTO;

		this.freeze = false;
		isDown = false;

		fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'end' );
		fireEvent( CONTROLLER_EVENT.ROTATE_CONTROL + 'end' );
	}.bind( this );

	this.onDocumentTouchStart = function ( event ) {
		event.preventDefault();
		event.stopPropagation();

		switch ( event.touches.length ) {
			case 1: // ROTATE
				if ( this.enableManualDrag !== true ) return;

				appState = CONTROLLER_STATE.MANUAL_ROTATE;


				this.freeze = true;
				isDown = true;

				tmpQuat.copy( this.object.quaternion );

				startX = currentX = event.touches[ 0 ].pageX;
				startY = currentY = event.touches[ 0 ].pageY;

				// Set consistent scroll speed based on current viewport width/height
				scrollSpeedX = ( 1200 / window.innerWidth ) * 0.1;
				scrollSpeedY = ( 800 / window.innerHeight ) * 0.1;

				this.element.addEventListener( 'touchmove', this.onDocumentTouchMove, false );
				this.element.addEventListener( 'touchend', this.onDocumentTouchEnd, false );

				fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'start' );
				fireEvent( CONTROLLER_EVENT.ROTATE_CONTROL + 'start' );

				break;

			case 2: // ZOOM
				if ( this.enableManualZoom !== true ) return;

				appState = CONTROLLER_STATE.MANUAL_ZOOM;

				this.freeze = true;

				tmpFOV = this.object.fov;

				zoomP1.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				zoomP2.set( event.touches[ 1 ].pageX, event.touches[ 1 ].pageY );

				zoomStart = zoomCurrent = zoomP1.distanceTo( zoomP2 );

				this.element.addEventListener( 'touchmove', this.onDocumentTouchMove, false );
				this.element.addEventListener( 'touchend', this.onDocumentTouchEnd, false );

				fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'start' );
				fireEvent( CONTROLLER_EVENT.ZOOM_CONTROL + 'start' );

				break;
		}
	}.bind( this );

	this.onDocumentTouchMove = function ( event ) {
		switch( event.touches.length ) {
			case 1:
				if(isDown){
					var movex = event.touches[ 0 ].pageX - currentX;
					var movey = event.touches[ 0 ].pageY - currentY;
					drag.lon = (drag.lon - scrollSpeedX * movex) % 360;
					drag.lat = Math.max(-cameraMaxLat, Math.min(cameraMaxLat, drag.lat + scrollSpeedY * movey));
				}

				currentX = event.touches[ 0 ].pageX;
				currentY = event.touches[ 0 ].pageY;

				break;

			case 2:
				zoomP1.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				zoomP2.set( event.touches[ 1 ].pageX, event.touches[ 1 ].pageY );
				break;
		}
	}.bind( this );

	this.onDocumentTouchEnd = function ( event ) {
		this.element.removeEventListener( 'touchmove', this.onDocumentTouchMove, false );
		this.element.removeEventListener( 'touchend', this.onDocumentTouchEnd, false );

		if ( appState === CONTROLLER_STATE.MANUAL_ROTATE ) {

			appState = CONTROLLER_STATE.AUTO; // reset control state

			this.freeze = false;
			isDown = false;

			fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'end' );
			fireEvent( CONTROLLER_EVENT.ROTATE_CONTROL + 'end' );

		} else if ( appState === CONTROLLER_STATE.MANUAL_ZOOM ) {

			this.constrainObjectFOV(); // re-instate original object FOV

			appState = CONTROLLER_STATE.AUTO; // reset control state

			this.freeze = false;

			fireEvent( CONTROLLER_EVENT.MANUAL_CONTROL + 'end' );
			fireEvent( CONTROLLER_EVENT.ZOOM_CONTROL + 'end' );

			tmpZoom = Math.min(zoomFactor,1);
		}
	}.bind( this );

	this.updateManualMove = function () {

		return function () {
			if ( appState === CONTROLLER_STATE.MANUAL_ROTATE ) {


			} else if ( appState === CONTROLLER_STATE.MANUAL_ZOOM ) {

				zoomCurrent = zoomP1.distanceTo( zoomP2 );

				zoomFactor = tmpZoom - (1 - zoomStart / zoomCurrent);

				if ( zoomFactor <= minZoomFactor && zoomFactor > maxZoomFactor) {

					this.object.fov = tmpFOV * zoomFactor;

					this.object.updateProjectionMatrix();

				}
			}
		};

	}();

	this.updateDeviceMove = function () {

		var alpha, beta, gamma, orient;

		return function () {

			alpha  = this.deviceOrientation.alpha || 0; // Z
			beta   = this.deviceOrientation.beta  || 0 ; // X'
			gamma  = this.deviceOrientation.gamma || 0 ; // Y''
			orient = this.screenOrientation       || 0 ; // O

			// only process non-zero 3-axis data
			if ( alpha !== 0 && beta !== 0 && gamma !== 0) {
				switch (this.os) {
						case 'ios':
								switch (orient) {
										case 0:
												gyro.lon = alpha + gamma;
												if (beta > 0) gyro.lat = beta - 90;
												break;
										case 90:
												if (gamma < 0) {
														gyro.lon = alpha - 90;
												} else {
														gyro.lon = alpha - 270;
												}
												if (gamma > 0) {
															gyro.lat = 90 - gamma;
												} else {
															gyro.lat = -90 - gamma;
												}
												break;
										case -90:
												if (gamma < 0) {
														gyro.lon = alpha - 90;
												} else {
														gyro.lon = alpha - 270;
												}
												if (gamma < 0) {
															gyro.lat = 90 + gamma;
												} else {
															gyro.lat = -90 + gamma;
												}
												break;
								}
								break;
						case 'android':
								switch (orient) {
										case 0:
												gyro.lon = alpha + gamma + 30;
												if (gamma > 90){
															gyro.lat = 90 - beta;
												}else{
															gyro.lat = beta - 90;
												}
												break;
										case 90:
												gyro.lon = alpha - 230;
												if (gamma > 0) {
															gyro.lat = 270 - gamma;
												} else {
															gyro.lat = -90 - gamma;
												}
												break;
										case -90:
												gyro.lon = alpha - 180;
												gyro.lat = -90 + gamma;
												break;
								}
								break;
				}

				gyro.lon = -gyro.lon;
				gyro.lon %= 360;
				if (gyro.lon < 0) gyro.lon += 360;

				gyro.lon = Math.round(gyro.lon);
				gyro.lat = Math.round(gyro.lat);

				if(gyro.lat + drag.lat>cameraMaxLat){
					drag.lat = cameraMaxLat- gyro.lat;
				}else if (gyro.lat + drag.lat<-cameraMaxLat){
					drag.lat = -cameraMaxLat- gyro.lat;
				}

				// console.log(gyro.lon+","+gyro.lat);
			}
		};

	}();

	this.update = function () {
		this.updateDeviceMove();

		if ( appState !== CONTROLLER_STATE.AUTO ) {
			this.updateManualMove();
		}

		var lon = drag.lon + gyro.lon;
		var lat = drag.lat + gyro.lat;

		setCameraByLatLon(lon,lat);

	};

	this.resetController = function () {

	}

	this.connect = function () {
		window.addEventListener( 'resize', this.constrainObjectFOV, false );

		window.addEventListener( 'orientationchange', this.onScreenOrientationChange, false );
		window.addEventListener( 'deviceorientation', this.onDeviceOrientationChange, false );

		window.addEventListener( 'compassneedscalibration', this.onCompassNeedsCalibration, false );

		this.element.addEventListener( 'mousedown', this.onDocumentMouseDown, false );
		this.element.addEventListener( 'touchstart', this.onDocumentTouchStart, false );

		this.freeze = false;
	};

	this.disconnect = function () {
		this.freeze = true;

		window.removeEventListener( 'resize', this.constrainObjectFOV, false );

		window.removeEventListener( 'orientationchange', this.onScreenOrientationChange, false );
		window.removeEventListener( 'deviceorientation', this.onDeviceOrientationChange, false );

		window.removeEventListener( 'compassneedscalibration', this.onCompassNeedsCalibration, false );

		this.element.removeEventListener( 'mousedown', this.onDocumentMouseDown, false );
		this.element.removeEventListener( 'touchstart', this.onDocumentTouchStart, false );
	};

};

PanoController.prototype = Object.create( THREE.EventDispatcher.prototype );
