/*global gapi*/
import { t } from "ttag";
import { SessionApi } from "metabase/services";
import Settings from "metabase/lib/settings";

export const deleteSession = async () => {
  try {
    await SessionApi.delete();
  } catch (error) {
    if (error.status !== 404) {
      console.error("Problem clearing session", error);
    }
  }
};

const GOOGLE_AUTH_ERRORS = {
  generic: t`There was an issue signing in with Google. Please contact an administrator.`,
  popup_closed_by_user: t`The window was closed before completing Google Authentication.`,
};

export const attachGoogleAuth = (element, onLogin, onError) => {
  if (!window.gapi) {
    window.setTimeout(() => attachGoogleAuth(element, onLogin, onError), 100);
    return;
  }

  window.gapi.load("auth2", () => {
    const auth2 = window.gapi.auth2.init({
      client_id: Settings.get("google-auth-client-id"),
      cookiepolicy: "single_host_origin",
      plugin_name: "metabase-legacy-google-auth",
    });

    auth2.attachClickHandler(
      element,
      {},
      user => {
        onLogin(user.getAuthResponse().id_token);
      },
      error => {
        onError(GOOGLE_AUTH_ERRORS[error.error] ?? GOOGLE_AUTH_ERRORS.generic);
      },
    );
  });
};

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
