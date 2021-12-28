/*global gapi*/

import { SessionApi } from "metabase/services";
import Settings from "metabase/lib/settings";

// actively delete the session and remove the cookie
export const deleteSession = async () => {
  try {
    await SessionApi.delete();
  } catch (error) {
    // there are cases when the session is deleted automatically, e.g when the password has been updated
    // in that case the BE would respond with 404
    if (error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
};

export const attachGoogleAuth = (element, onSuccess, onError) => {
  // if gapi isn't loaded yet then wait 100ms and check again; keep doing this until we're ready
  if (!window.gapi) {
    window.setTimeout(() => attachGoogleAuth(element, onSuccess, onError), 100);
    return;
  }

  window.gapi.load("auth2", () => {
    const auth2 = window.gapi.auth2.init({
      client_id: Settings.get("google-auth-client-id"),
      cookiepolicy: "single_host_origin",
    });

    auth2.attachClickHandler(
      element,
      {},
      user => onSuccess(user.getAuthResponse().id_token),
      error => onError(error.error),
    );
  });
};

/// clear out Google Auth credentials in browser if present
export const clearGoogleAuthCredentials = async () => {
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
};
