/*global gapi*/

/// clear out Google Auth credentials in browser if present
export function clearGoogleAuthCredentials() {
    let googleAuth = typeof gapi !== 'undefined' && gapi && gapi.auth2 ? gapi.auth2.getAuthInstance() : undefined;
    if (!googleAuth) return;

    googleAuth.signOut().then(function() {
        console.log('Cleared Google Auth credentials.');
    });
}
