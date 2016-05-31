export const METABASE_SESSION_COOKIE = 'metabase.SESSION_ID';

var mb_cookies = {};


// Handles management of Metabase cookie work
var MetabaseCookies = {
    // a little weird, but needed to keep us hooked in with Angular
    bootstrap: function($rootScope, $location, ipCookie) {
        mb_cookies.scope = $rootScope;
        mb_cookies.location = $location;
        mb_cookies.ipCookie = ipCookie;
    },

    // set the session cookie.  if sessionId is null, clears the cookie
    setSessionCookie: function(sessionId) {
        if (sessionId) {
            // set a session cookie
            var isSecure = (mb_cookies.location.protocol() === "https") ? true : false;
            mb_cookies.ipCookie(METABASE_SESSION_COOKIE, sessionId, {
                path: '/',
                expires: 14,
                secure: isSecure
            });

            // send a login notification event
            mb_cookies.scope.$broadcast('appstate:login', sessionId);

        } else {
            sessionId = mb_cookies.ipCookie(METABASE_SESSION_COOKIE);

            // delete the current session cookie
            mb_cookies.ipCookie.remove(METABASE_SESSION_COOKIE);

            // send a logout notification event
            mb_cookies.scope.$broadcast('appstate:logout', sessionId);
        }
    }
}

export default MetabaseCookies;
