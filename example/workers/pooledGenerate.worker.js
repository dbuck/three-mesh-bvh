import 'regenerator-runtime/runtime';
import { expose, Transfer } from 'threads';
import MeshBVH from '../../src/MeshBVH';
import { BufferAttribute, BufferGeometry } from 'three';

let jobIndex = 0;

expose( async function generateBvh( data ) {

	const { index, position, options, logging } = data;
	jobIndex ++;

	try {

		if ( logging ) console.time( 'Worker:Geometry' + jobIndex );

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( position, 3, false ) );
		if ( index ) {

			geometry.setIndex( new BufferAttribute( index, 1, false ) );

		}

		if ( logging ) console.timeEnd( 'Worker:Geometry' + jobIndex );

		if ( logging ) console.time( 'Worker:BVH' + jobIndex );

		options.lazyGeneration = false;
		const bvh = new MeshBVH( geometry, options );
		const serialized = MeshBVH.serialize( bvh, geometry, false );

		if ( logging ) console.timeEnd( 'Worker:BVH' + jobIndex );

		return Transfer( { error: null, serialized, position }, [ serialized.index.buffer, position.buffer ] );

	} catch ( error ) {

		console.error( 'Worker:error', error );
		return { error, serialized: null };

	}

} );
