var nostr_image_host = {
	getImageFromImageId: async image_id => {
	    var relay_hex = image_id.substring( 64 );
	    var relay = nostr_image_host.hexToText( relay_hex );
	    var file_id = image_id.substring( 0, 64 );
	    var thing_i_need = await nostr_image_host.load_file( file_id, relay );
	    var image_b64 = await nostr_image_host.getNote( `nostr_image_${thing_i_need}` );
	    sessionStorage.removeItem( `nostr_image_${thing_i_need}` );
	    return image_b64;
	},
	getNote: async item => {
	    async function isNoteSetYet( note_i_seek ) {
	        return new Promise( function( resolve, reject ) {
	            if ( !note_i_seek ) {
	                setTimeout( async function() {
	                    var msg = await isNoteSetYet( sessionStorage[ item ] );
	                    resolve( msg );
	                }, 100 );
	            } else {
	                resolve( note_i_seek );
	            }
	        });
	    }
	    async function getTimeoutData() {
	        var note_i_seek = await isNoteSetYet( sessionStorage[ item ] );
	        return note_i_seek;
	    }
	    var returnable = await getTimeoutData();
	    return returnable;
	},
	textToHex: text => {
	    var encoder = new TextEncoder().encode( text );
	    return [...new Uint8Array(encoder)]
	        .map( x => x.toString( 16 ).padStart( 2, "0" ) )
	        .join( "" );
	},
	hexToText: hex => {
	    var bytes = new Uint8Array(Math.ceil(hex.length / 2));
	    for (var i = 0; i < hex.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
	    var text = new TextDecoder().decode( bytes );
	    return text;
	},
	load_file: ( file_id, relay ) => {
        return new Promise( function( resolve, reject ) {
            var pieces = [];
            var socket = new WebSocket( relay );
            socket.addEventListener('message', async function( message ) {
                var [ type, subId, event ] = JSON.parse( message.data );
                var { kind, content, tags } = event || {}
                if (!event || event === true) return;
                if ( subId.startsWith( "0000" ) ) {
                    tags.forEach( async item => {
                        if ( item[ 0 ] == "pieces" ) {
                            var parts = item[ 1 ].split( " of " );
                            pieces[ Number( parts[ 0 ] ) - 1 ] = content;
                            if ( parts[ 0 ] == "1" ) {
                                whole_id = event.id;
                                if ( pieces.length == Number( parts[ 1 ] ) ) {
                                    var whole = pieces.join( "" );
                                    sessionStorage[ `nostr_image_${whole_id}` ] = whole;
                                    socket.close();
                                    await nostr_image_host.waitSomeSeconds( 1 );
                                    location.hash = "#your_image";
                                    resolve( whole_id );
                                }
                            }
                        }
                    });
                } else {
                    var subId   = "0000" + nostr_image_host.bytesToHex( nobleSecp256k1.utils.randomPrivateKey() ).substring( 4, 16 );
                    var filter  = { "authors": [ event.pubkey ], kinds: [ 57009 ] }
                    var subscription = [ "REQ", subId, filter ];
                    socket.send(JSON.stringify( subscription ));
                }
            });
            socket.addEventListener('open', async function( e ) {
                var subId   = nostr_image_host.bytesToHex( nobleSecp256k1.utils.randomPrivateKey() ).substring( 0, 16 );
                var filter  = { "ids": [ file_id ], kinds: [ 57009 ] }
                var subscription = [ "REQ", subId, filter ];
                socket.send(JSON.stringify( subscription ));
            });
        });
    },
    getSignedEvent: async (event, privateKey) => {
        var eventData = JSON.stringify([
            0,                  // Reserved for future use
            event['pubkey'],        // The sender's public key
            event['created_at'],    // Unix timestamp
            event['kind'],      // Message “kind” or type
            event['tags'],      // Tags identify replies/recipients
            event['content']        // Your note contents
        ])
        event.id  = sha256( eventData ).toString( 'hex' );
        event.sig = await schnorr.sign( event.id, privateKey );
        return event;
    },
    hexToBytes: hex => Uint8Array.from( hex.match( /.{1,2}/g ).map( ( byte ) => parseInt( byte, 16 ) ) ),
    bytesToHex: bytes => bytes.reduce( ( str, byte ) => str + byte.toString( 16 ).padStart( 2, "0" ), "" ),
    whole_id: null,
    upload_data: [],
    privKey: null,
    pubKey: null,
    waitSomeSeconds: num => {
        var num = num.toString() + "000";
        num = Number( num );
        return new Promise( resolve => setTimeout( resolve, num ) );
    },
    uploadToNostr: async ( file, relay, debug ) => {
        return new Promise( async ( resolve, reject ) => {
            if ( !relay ) return;
            if ( !relay.startsWith( "wss://" ) ) relay = "wss://" + relay;
            var b64 = await nostr_image_host.encodeBase64( file );
            var socket = new WebSocket( relay );
            socket.addEventListener('open', async function( e ) {
                var array = b64.match(/.{1,4000}/g);
                var i; for ( i=0; i<array.length; i++ ) {
                    var note = array[ i ];
                    var part = i + 1;
                    var whole = array.length;
                    var id = await nostr_image_host.sendNoteAndReturnId( note, part, whole, socket );
                    if ( debug ) var percent = ( ( part / whole ) * 100 ).toFixed( 2 );
                    if ( debug ) console.log( `${percent}% uploaded` );
                    if ( percent == 100 ) resolve( id + textToHex( relay ) );
                    await waitSomeSeconds( 2 );
                }
                socket.close();
            });
        });
    },
    encodeBase64: file => {
        return new Promise( function( resolve, reject ) {
            var imgReader = new FileReader();
            imgReader.onloadend = function() {
                resolve( imgReader.result.toString() );
            }
            imgReader.readAsDataURL( file );
        });
    }
}
