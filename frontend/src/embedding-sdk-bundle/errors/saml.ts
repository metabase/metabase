import { MetabaseError } from "./base";

export function SAML_POPUP_BLOCKED() {
  return new MetabaseError(
    "SAML_POPUP_BLOCKED",
    "Popup blocked. Please allow popups for this site.",
  );
}

export function SAML_POPUP_CLOSED() {
  return new MetabaseError(
    "SAML_POPUP_CLOSED",
    "Authentication was canceled by the user (popup closed).",
  );
}

export function SAML_TIMEOUT() {
  return new MetabaseError(
    "SAML_TIMEOUT",
    "Authentication timed out after waiting for SAML login.",
  );
}
