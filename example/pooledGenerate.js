// async-awaiting polyfill for funs.
import 'regenerator-runtime/runtime';
import { PooledBVHGenerate } from './workers/PooledBVHGenerate.js';

import * as THREE from 'three';
import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { acceleratedRaycast } from '../src/index.js';
import MeshBVH from '../src/MeshBVH.js';

THREE.Mesh.raycast = acceleratedRaycast;

const params = {

	useWebWorker: true,
	count: 10,
	radius: 0.8,
	tube: 0.1,
	tubularSegments: 750,
	radialSegments: 750,
	p: 3,
	q: 5,

	displayHelper: false,
	helperDepth: 10,

};

let renderer, camera, scene, clock, gui, outputContainer, helper, group, stats;
let bvhWorkerPool;
let generating = false;
const toProcess = [];

init();
render();

function init() {

	const bgColor = 0xffca28;

	outputContainer = document.getElementById( 'output' );

	// renderer setup
	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setClearColor( bgColor, 1 );
	renderer.outputEncoding = THREE.LinearEncoding;
	document.body.appendChild( renderer.domElement );

	// scene setup
	scene = new THREE.Scene();
	scene.fog = new THREE.Fog( 0xffca28, 20, 60 );

	const light = new THREE.DirectionalLight( 0xffffff, 1 );
	light.position.set( 1, 1, 1 );
	scene.add( light );
	scene.add( new THREE.AmbientLight( 0xb0bec5, 0.8 ) );

	// camera setup
	camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 50 );
	camera.position.set( 0, 0, 10 );
	camera.far = 100;
	camera.updateProjectionMatrix();

	clock = new THREE.Clock();

	// stats setup
	stats = new Stats();
	document.body.appendChild( stats.dom );

	group = new THREE.Group();
	scene.add( group );

	for ( let i = 0; i < 400; i ++ ) {

		const sphere = new THREE.Mesh(
			new THREE.SphereBufferGeometry( 1, 32, 32 ),
			new THREE.MeshBasicMaterial()
		);
		sphere.position.set(
			Math.random() - 0.5,
			Math.random() - 0.5,
			Math.random() - 0.5
		).multiplyScalar( 70 );
		sphere.scale.setScalar( Math.random() * 0.3 + 0.1 );
		group.add( sphere );

	}

	bvhWorkerPool = new PooledBVHGenerate( { size: undefined, name: 'bvh', concurrency: undefined } );

	gui = new GUI();
	const helperFolder = gui.addFolder( 'helper' );
	helperFolder.add( params, 'displayHelper' ).name( 'enabled' ).onChange( v => {

		if ( v && helper ) {

			helper.update();

		}

	} );
	helperFolder.add( params, 'helperDepth', 1, 50, 1 ).onChange( v => {

		if ( helper ) {

			helper.depth = v;
			helper.update();

		}

	} );
	helperFolder.open();

	const knotFolder = gui.addFolder( 'knot' );
	knotFolder.add( params, 'useWebWorker' );
	knotFolder.add( params, 'count', 1, 10, 3 );
	knotFolder.add( params, 'radius', 0.5, 3, 0.01 );
	knotFolder.add( params, 'tube', 0.2, 1.2, 0.01 );
	knotFolder.add( params, 'tubularSegments', 50, 1000, 1 );
	knotFolder.add( params, 'radialSegments', 5, 1000, 1 );
	knotFolder.add( params, 'p', 1, 10, 1 );
	knotFolder.add( params, 'q', 1, 10, 1 );
	knotFolder.add( { regenerateKnot }, 'regenerateKnot' ).name( 'regenerate' );
	knotFolder.open();

	regenerateKnot();

	window.addEventListener( 'resize', function () {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );

	}, false );

}

function makeKnotGeo( color ) {

	return new THREE.Mesh(
		new THREE.TorusKnotBufferGeometry(
			params.radius,
			params.tube,
			params.tubularSegments,
			params.radialSegments,
			params.p,
			params.q
		),
		new THREE.MeshStandardMaterial( {
			color: new THREE.Color( color ).convertSRGBToLinear(),
			roughness: 0.75

		} )
	);

}

function regenerateKnot() {

	if ( generating ) {

		return;

	}

	generating = true;

	if ( toProcess.length ) {

		toProcess.forEach( ( item ) => {

			item.material.dispose();
			item.geometry.dispose();
			group.remove( item );

		} );

		toProcess.length = 0;

	}

	const stallStartTime = window.performance.now();
	const geomStartTime = window.performance.now();

	console.time( 'Demo:makeGeometry' + params.count );
	for ( let i = 0; i < params.count; i ++ ) {

		toProcess.push( makeKnotGeo( new THREE.Color().setHSL( Math.random(), 1, 0.3 ).getHex() ) );

	}

	console.timeEnd( 'Demo:makeGeometry' + params.count );

	const geomTime = window.performance.now() - geomStartTime;
	const startTime = window.performance.now();
	let totalStallTime;
	let deltaTime = 0;
	if ( params.useWebWorker ) {

		toProcess.forEach( ( item, i ) => {

			console.time( 'Demo:itemQueue' + i );

			bvhWorkerPool.queue( item.geometry ).then( bvh => {

				item.geometry.boundsTree = bvh;
				item.position.set( 0, ( ( params.radius * 2 ) + 0.5 ) * i, 0 );
				group.add( item );
				deltaTime = window.performance.now() - startTime;

				console.timeEnd( 'Demo:itemQueue' + i );

			} );

		} );

		// full time for all of them to complete
		bvhWorkerPool.completed().then( () => {

			deltaTime = window.performance.now() - startTime;

			outputContainer.textContent =
				`Geometry Generation Time : ${ geomTime.toFixed( 3 ) }ms\n` +
				`BVH Generation Time : ${ deltaTime.toFixed( 3 ) }ms\n` +
				`Frame Stall Time : ${ totalStallTime.toFixed( 3 ) }`;

		} );

	} else {

		toProcess.forEach( ( item, i ) => {

			item.geometry.boundsTree = new MeshBVH( item.geometry, { lazyGeneration: false } );
			item.position.set( 0, ( ( params.radius * 2 ) + 0.5 ) * i, 0 );
			group.add( item );

		} );
		deltaTime = window.performance.now() - startTime;

	}

	generating = false;
	totalStallTime = window.performance.now() - stallStartTime;

	outputContainer.textContent =
		`Geometry Generation Time : ${ geomTime.toFixed( 3 ) }ms\n` +
		`BVH Generation Time : ${ deltaTime.toFixed( 3 ) }ms\n` +
		`Frame Stall Time : ${ totalStallTime.toFixed( 3 ) }`;

}

function render() {

	stats.update();
	requestAnimationFrame( render );

	let delta = clock.getDelta();
	group.rotation.x += 0.4 * delta;
	group.rotation.y += 0.6 * delta;

	if ( helper ) {

		helper.visible = params.displayHelper;

	}

	renderer.render( scene, camera );

}
