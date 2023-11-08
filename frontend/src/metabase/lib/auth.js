/*global gapi*/

import { SessionApi } from "metabase/services";

// actively delete the session and remove the cookie
export async function deleteSession() {
  try {
    await SessionApi.delete();
  } catch (error) {
    // there are cases when the session is deleted automatically, e.g when the password has been updated
    // in that case the BE would respond with 404
    if (error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
}

/// clear out Google Auth credentials in browser if present
export async function clearGoogleAuthCredentials() {
  const googleAuth =
    typeof gapi !== "undefined" && gapi && gapi.auth2
      ? gapi.auth2.getAuthInstance()
      : undefined;
  if (!googleAuth) {
    return;
  }

  try {
    await googleAuth.signOut();
  } catch (error) {
    console.error("Problem clearing Google Auth credentials", error);
  }
}
