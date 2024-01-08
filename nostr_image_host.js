var nostr_image_host = {
    hexToBytes: hex => Uint8Array.from( hex.match( /.{1,2}/g ).map( ( byte ) => parseInt( byte, 16 ) ) ),
    bytesToHex: bytes => bytes.reduce( ( str, byte ) => str + byte.toString( 16 ).padStart( 2, "0" ), "" ),
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
    hexToBech32: ( prefix, hex ) => {
        var words = bech32.bech32m.toWords( nostr_image_host.hexToBytes( hex ) );
        return bech32.bech32m.encode( prefix, words, 10000 );
    },
    bech32ToHex: bech32string => {
        var decoded = bech32.bech32m.fromWords( bech32.bech32m.decode( bech32string, 10000 ).words );
        return nostr_image_host.bytesToHex( decoded );
    },
    hexToBase64: hex => btoa( hex.match( /\w{2}/g ).map( a => String.fromCharCode( parseInt( a, 16 ) ) ).join( "" ) ),
    encodeBase64: file => {
        return new Promise( function( resolve, reject ) {
            var imgReader = new FileReader();
            imgReader.onloadend = async event => {
                var uint = new Uint8Array( event.target.result );
                var hex = nostr_image_host.bytesToHex( uint );
                var base64 = nostr_image_host.hexToBase64( hex );
                resolve( base64 );
            }
            imgReader.readAsArrayBuffer(file);
        });
    },
    waitSomeSeconds: num => {
        var num = num.toString() + "000";
        num = Number( num );
        return new Promise( resolve => setTimeout( resolve, num ) );
    },
    getNote: async item => {
        async function isNoteSetYet( note_i_seek ) {
            return new Promise( function( resolve, reject ) {
                if ( !note_i_seek ) {
                    setTimeout( async function() {
                        var msg = await isNoteSetYet( nostr_image_host[ item ] );
                        resolve( msg );
                    }, 100 );
                } else {
                    resolve( note_i_seek );
                }
            });
        }
        async function getTimeoutData() {
            var note_i_seek = await isNoteSetYet( nostr_image_host[ item ] );
            return note_i_seek;
        }
        var returnable = await getTimeoutData();
        return returnable;
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
        event.id  = nostr_image_host.bytesToHex( sha256( eventData ) );
        event.sig = await nobleSecp256k1.schnorr.sign( event.id, privateKey );
        return event;
    },
    sendNoteAndReturnId: async ( note, part, whole, socket, privKey, pubKey ) => {
        var event = {
            "content"    : note,
            "created_at" : Math.floor( Date.now() / 1000 ),
            "kind"       : 57009,
            "tags"       : [ [ "pieces", `${part} of ${whole}` ] ],
            "pubkey"     : pubKey,
        }
        var signedEvent = await nostr_image_host.getSignedEvent( event, privKey );
        socket.send(JSON.stringify([ "EVENT", signedEvent ]));
        return signedEvent.id;
    },
    uploadToNostr: async ( file, relay ) => {
        return new Promise( async ( resolve, reject ) => {
            if ( !relay ) return;
            if ( !relay.startsWith( "wss://" ) ) relay = "wss://" + relay;
            var b64 = await nostr_image_host.encodeBase64( file );
            var hash = nostr_image_host.bytesToHex( sha256( b64 ) );
            var socket = new WebSocket( relay );
            socket.addEventListener('open', async function( e ) {
                var array = b64.match(/.{1,4000}/g);
                var privKey = nostr_image_host.bytesToHex( nobleSecp256k1.utils.randomPrivateKey() );
                var pubKey = nobleSecp256k1.getPublicKey( privKey, true ).substring( 2 );
                nostr_image_host[ `n_${hash}_percent_done_uploading` ] = "0%";
                var i; for ( i=0; i<array.length; i++ ) {
                    var note = array[ i ];
                    var part = i + 1;
                    var whole = array.length;
                    var id = await nostr_image_host.sendNoteAndReturnId( note, part, whole, socket, privKey, pubKey );
                    var percent = Number( ( ( part / whole ) * 100 ).toFixed( 2 ) );
                    nostr_image_host[ `n_${hash}_percent_done_uploading` ] = percent + "%";
                    if ( percent == 100 ) resolve( nostr_image_host.hexToBech32( "nimg", id + nostr_image_host.textToHex( relay ) ) );
                    await nostr_image_host.waitSomeSeconds( 2 );
                }
                socket.close();
            });
        });
    },
    load_file: ( file_id, relay ) => {
        return new Promise( function( resolve, reject ) {
            var pieces = [];
            var socket = new WebSocket( relay );
            nostr_image_host[ `n_${file_id}_percent_done_downloading` ] = `0%`;
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
                                if ( pieces.length == Number( parts[ 1 ] ) ) {
                                    var whole = pieces.join( "" );
                                    nostr_image_host[ `n_${file_id}_percent_done_downloading` ] = `100%`;
                                    nostr_image_host[ `nostr_image_${event.id}` ] = whole;
                                    socket.close();
                                    resolve( event.id );
                                }
                            } else {
                                var num_of_loaded_parts = 0;
                                pieces.forEach( item => {if ( item ) num_of_loaded_parts = num_of_loaded_parts + 1;} );
                                var percent = Number( ( ( num_of_loaded_parts / Number( parts[ 1 ] ) ) * 100 ).toFixed( 2 ) );
                                nostr_image_host[ `n_${file_id}_percent_done_downloading` ] = `${percent}%`;
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
    downloadFromNostr: async image_id => {
        image_id = nostr_image_host.bech32ToHex( image_id );
        var relay_hex = image_id.substring( 64 );
        var relay = nostr_image_host.hexToText( relay_hex );
        var file_id = image_id.substring( 0, 64 );
        var thing_i_need = await nostr_image_host.load_file( file_id, relay );
        var image_b64 = await nostr_image_host.getNote( `nostr_image_${thing_i_need}` );
        delete nostr_image_host[ `nostr_image_${thing_i_need}` ];
        return image_b64;
    }
}
