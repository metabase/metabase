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
    "Authentication did not complete before the popup was closed.",
  );
}

export function SAML_SITE_URL_MISMATCH() {
  return new MetabaseError(
    "SAML_SITE_URL_MISMATCH",
    "SAML authentication requires metabaseInstanceUrl to use the same origin as the configured Site URL.",
  );
}

export function SAML_TIMEOUT() {
  return new MetabaseError(
    "SAML_TIMEOUT",
    "Authentication timed out after waiting for SAML login.",
  );
}
