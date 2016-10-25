
import { clearGoogleAuthCredentials } from "metabase/lib/auth";

import Cookies from "js-cookie";

export const METABASE_SESSION_COOKIE = 'metabase.SESSION_ID';

// Handles management of Metabase cookie work
var MetabaseCookies = {
    // set the session cookie.  if sessionId is null, clears the cookie
    setSessionCookie: function(sessionId) {
        const options = {
            path: '/',
            expires: 14,
            secure: window.location.protocol === "https:"
        };

        try {
            if (sessionId) {
                // set a session cookie
                Cookies.set(METABASE_SESSION_COOKIE, sessionId, options);
            } else {
                sessionId = Cookies.get(METABASE_SESSION_COOKIE);

                // delete the current session cookie and Google Auth creds
                Cookies.remove(METABASE_SESSION_COOKIE);
                clearGoogleAuthCredentials();

                return sessionId;
            }
        } catch (e) {
            console.error("setSessionCookie:", e);
        }
    }
}

export default MetabaseCookies;
