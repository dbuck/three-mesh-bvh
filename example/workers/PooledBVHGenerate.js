// polyfill async/await because :shrug:
import 'regenerator-runtime/runtime';
import { Pool, spawn, Transfer, Worker } from 'threads';
import MeshBVH from '../../src/MeshBVH';

/**
 * A worker which uses thread.js to manage a queue of generate tasks
 * Mostly a light wrapper around: https://threads.js.org/usage-pool
 */
export class PooledBVHGenerate {

	/*
	 * Pool creation options
	 * see: https://threads.js.org/usage-pool#pool-creation
	 */
	constructor( poolOptions = { name: 'bvh' } ) {

		this.pool = Pool( () => spawn( new Worker( './pooledGenerate.worker.js' ) ), poolOptions );
		this.logging = false;
		this.jobIndex = 0;

	}

	/**
	 * Enqueue a geometry to be converted, returns a Task which resolves to the final result, and can be cancelled
	 */
	async queue( geometry, options = { lazyGeneration: false } ) {

		const jobIndex = this.jobIndex ++;
		const logging = this.logging;

		return this.pool.queue( async generateBvh => {

			if ( logging ) console.time( 'BVHPool: generateBvh ' + jobIndex );

			const index = geometry.index ? geometry.index.array : null;
			const position = geometry.attributes.position.array;
			if ( position.isInterleavedBufferAttribute || index && index.isInterleavedBufferAttribute ) {

				throw new Error( 'PooledBVHGenerate: InterleavedBufferAttribute are not supported for the geometry attributes.' );

			}

			const transferrables = [ position ];
			if ( index ) {

				transferrables.push( index );

			}

			const result = await generateBvh( Transfer( { index, position, options }, transferrables.map( arr => arr.buffer ) ) );

			if ( result.error ) {

				return new Error( result.error );

			}

			// Load the bvh into the geometry, and re-attach the arrays now that ownership has been transferred back to the main thread.
			const bvh = MeshBVH.deserialize( result.serialized, geometry, false, true );

			geometry.attributes.position.array = result.position;
			if ( geometry.index ) {

				geometry.index.array = result.serialized.index;

			}

			if ( logging ) console.timeEnd( 'BVHPool: generateBvh ' + jobIndex );

			return bvh;

		} );

	}

	async settled() {

		return this.pool.settled();

	}

	/** Promise which resolves when the queue is completed */
	async completed() {

		return this.pool.completed();

	}

	/** Promise which resolves after */
	async terminate( forceTerminate = false ) {

		return this.pool.terminate( forceTerminate );

	}

}
