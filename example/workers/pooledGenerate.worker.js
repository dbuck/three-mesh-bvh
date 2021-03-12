import 'regenerator-runtime/runtime';
import { expose, Transfer } from 'threads';
import MeshBVH from '../../src/MeshBVH';
import { BufferAttribute, BufferGeometry } from 'three';

expose( async function generateBvh( data ) {

	const { index, position, options } = data;

	try {

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( position, 3, false ) );
		if ( index ) {

			geometry.setIndex( new BufferAttribute( index, 1, false ) );

		}

		options.lazyGeneration = false;
		const bvh = new MeshBVH( geometry, options );
		const serialized = MeshBVH.serialize( bvh, geometry, false );

		return Transfer( { error: null, serialized, position }, [ serialized.index.buffer, position.buffer ] );

	} catch ( error ) {

		console.error( 'BVHPool: worker error ', error );
		return { error, serialized: null };

	}

} );
