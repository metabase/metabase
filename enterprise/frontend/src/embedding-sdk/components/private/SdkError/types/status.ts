// errors that come from BE
type BackendErrorStatus =
  | "error-embedding-sdk-disabled"
  | "error-sso-disabled"
  | "error-sso-jwt-disabled"
  | "error-jwt-bad-unsigning"
  | "error-jwt-based-authentication-not-available";

// FE auth issues
type FrontendErrorStatus =
  | "error-fe-cannot-authenticate"
  | "error-fe-bad-jwt-provider-uri"
  | "error-fe-cannot-refresh-token"
  | "error-fe-received-response-object"
  | "error-fe-received-non-json-object";

// FE UI issues
type NotFoundStatus = "question-not-found" | "dashboard-not-found";

export type SdkErrorStatus =
  | BackendErrorStatus
  | FrontendErrorStatus
  | NotFoundStatus
  // please please please don't use this unless you have no idea what's going on
  | "error-unknown";
