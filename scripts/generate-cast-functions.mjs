import fs from 'fs';
import path from 'path';

function addHeaderComment( str ) {

	return `
/**************************************************************************************************
 *
 * This file is generated from castFunctions.js and scripts/generate-cast-function.mjs. Do not edit.
 *
 *************************************************************************************************/
` + str;

}

function replaceNodeNames( str ) {

	const coerce = ( name, count = 4 ) => {

		return name === 'node' ? `stride${ count }Offset` : name;

	};

	const map = {

		'(\\w+)\\.boundingData': name => coerce( name ),
		'(\\w+)\\.offset': name => `uint32Array[ ${ coerce( name ) } + 6 ]`,

		'! ! (\\w+)\\.count': name => `uint16Array[ ${ coerce( name, 2 ) } + 15 ] === 0xffff`,
		'(\\w+)\\.count': name => `uint16Array[ ${ coerce( name, 2 ) } + 14 ]`,

		'(\\w+)\\.left': name => `${ coerce( name ) } + 8`,
		'(\\w+)\\.right': name => `uint32Array[ ${ coerce( name ) } + 6 ]`,
		'(\\w+)\\.splitAxis': name => `uint32Array[ ${ coerce( name ) } + 7 ]`,

	};
	const validNames = [ 'c1', 'c2', 'left', 'right', 'node' ];

	str = str.replace( /(\w+)\.boundingData\[(.*)\]/g, ( match, name, index ) => {

		if ( validNames.includes( name ) ) {

			return `float32Array[ ${ name } +${ index }]`;

		} else {

			return match;

		}

	} );

	Object.entries( map ).forEach( ( [ key, value ] ) => {

		str = str.replace(
			new RegExp( key, 'g' ),
			( match, name ) => {

				if ( validNames.includes( name ) ) {

					return `/* ${ match.replace( '.', ' ' ) } */ ` + value( name );

				} else {

					return match;

				}

			}
		);

	} );

	return str.replace( /\]\[/g, '+' );

}

function replaceFunctionNames( str ) {

	const arr = [

		'\\sraycast',
		'\\sraycastFirst',
		'\\sshapecast',
		'\\sintersectsGeometry'

	];

	const defRegexp = new RegExp( '(' + arr.join( '|' ) + ')\\((\\s|\\n)?node', 'gm' );
	const callRegexp = new RegExp( '(' + arr.join( '|' ) + ')\\(', 'gm' );
	const constRegexp = new RegExp( 'const(' + arr.join( '|' ) + ')', 'gm' );

	return str
		.replace( defRegexp, ( match, funcName ) => `${ funcName }Buffer( stride4Offset` )
		.replace( callRegexp, ( match, funcName ) => `${ funcName }Buffer(` )
		.replace( constRegexp, ( match, funcName ) => `const${ funcName }Buffer` );

}

function replaceFunctionCalls( str ) {

	return str
		.replace( /arrayToBox\((.*?),/g, ( match, arg ) => `arrayToBoxBuffer(${ arg }, float32Array,` )
		.replace( /intersectRay\((.*?),/g, ( match, arg ) => `intersectRayBuffer(${ arg }, float32Array,` );

}

function removeUnneededCode( str ) {

	const replacement = 'const stride2Offset = stride4Offset * 2, float32Array = _float32Array, uint16Array = _uint16Array, uint32Array = _uint32Array;';
	const continueGenerationRegexp = new RegExp( 'if \\( node.continueGeneration \\)(.|\n)*?}\n', 'mg' );
	const intersectRayRegexp = new RegExp( 'function intersectRay\\((.|\n)*?}\n', 'mg' );
	return str
		.replace( continueGenerationRegexp, replacement )
		.replace( intersectRayRegexp, '' );

}

function addFunctions( str ) {

	const instersectsRayBuffer =
`
function intersectRayBuffer( stride4Offset, array, ray, target ) {

	arrayToBoxBuffer( stride4Offset, array, boundingBox );
	return ray.intersectBox( boundingBox, target );

}`;

	const setBuffer =
`
const bufferStack = [];
let _prevBuffer;
let _float32Array;
let _uint16Array;
let _uint32Array;
export function setBuffer( buffer ) {

	if ( _prevBuffer ) {

		bufferStack.push( _prevBuffer );

	}

	_prevBuffer = buffer;
	_float32Array = new Float32Array( buffer );
	_uint16Array = new Uint16Array( buffer );
	_uint32Array = new Uint32Array( buffer );

}

export function clearBuffer() {

	_prevBuffer = null;
	_float32Array = null;
	_uint16Array = null;
	_uint32Array = null;

	if ( bufferStack.length ) {

		setBuffer( bufferStack.pop() );

	}

}
`;

	const arrayToBoxBuffer =
`
function arrayToBoxBuffer( stride4Offset, array, target ) {

	target.min.x = array[ stride4Offset ];
	target.min.y = array[ stride4Offset + 1 ];
	target.min.z = array[ stride4Offset + 2 ];

	target.max.x = array[ stride4Offset + 3 ];
	target.max.y = array[ stride4Offset + 4 ];
	target.max.z = array[ stride4Offset + 5 ];

}
`;

	return str + arrayToBoxBuffer + instersectsRayBuffer + setBuffer;


}


const templatePath = path.resolve( './src/castFunctions.js' );
const bufferFilePath = path.resolve( './src/castFunctionsBuffer.js' );
const str = fs.readFileSync( templatePath, { encoding: 'utf8' } );

let result = str;
result = removeUnneededCode( result );
result = replaceFunctionCalls( result );
result = replaceNodeNames( result );
result = replaceFunctionNames( result );
result = addFunctions( result );
result = addHeaderComment( result );
fs.writeFileSync( bufferFilePath, result );