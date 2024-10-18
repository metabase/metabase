export type ErrorInfo = {
  title: string;
  description?: string;
  link?: string;
};

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

const SDK_DISABLED_ERROR = {
  title: "SDK Embedding is disabled.",
  lebron: "james",
  description: "Enable it in the Embedding settings",
} as const;

const JWT_VALIDATION_ERROR = {
  title: "Couldn't validate JWT token",
  description:
    "Check that your JWT signing key matches the one in Authentication > JWT > Server settings",
} as const;

const SSO_DISABLED_ERROR = {
  title: "SSO has not been enabled and/or configured",
} as const;

const JWT_SSO_DISABLED_ERROR = {
  title: "JWT SSO has not been enabled and/or configured",
} as const;

const JWT_AUTH_UNAVAILABLE_ERROR = {
  title:
    "JWT-based authentication is a paid feature not currently available to your instance.",
  description: "Please upgrade to use it.",
  link: "metabase.com/upgrade/",
} as const;

const JWT_RESPONSE_OBJECT_ERROR = {
  title: "Received Response object from JWT provider URI",
  description:
    "Ensure that you are returning a JSON object containing the JWT data",
} as const;

const JWT_NON_JSON_ERROR = {
  title: "Received non-JSON response from JWT Provider URI",
  description:
    "Ensure that you are returning a JSON object containing the JWT data",
} as const;

const QUESTION_NOT_FOUND_ERROR = {
  title: "Question not found",
  description: "Ensure you have the right question ID.",
} as const;

const DASHBOARD_NOT_FOUND_ERROR = {
  title: "Dashboard not found",
  description: "Ensure you have the right dashboard ID.",
} as const;

const CANNOT_AUTHENTICATE_ERROR = {
  title: "Cannot authenticate user.",
  description: "Make sure you're logged in to your application.",
} as const;

const BAD_JWT_PROVIDER_URI_ERROR = {
  title: "Bad JWT Provider URI",
  description: "Make sure your JWT provider URI is correct.",
} as const;

const CANNOT_REFRESH_TOKEN_ERROR = {
  title: "Cannot refresh token.",
  description: "Ensure your backend is running and is connected to Metabase.",
} as const;

const UNKNOWN_ERROR = {
  title: "Something went wrong",
} as const;

const ERROR_INFO: Record<SdkErrorStatus, ErrorInfo> = {
  "error-embedding-sdk-disabled": SDK_DISABLED_ERROR,
  "error-jwt-bad-unsigning": JWT_VALIDATION_ERROR,
  "error-sso-disabled": SSO_DISABLED_ERROR,
  "error-sso-jwt-disabled": JWT_SSO_DISABLED_ERROR,
  "error-jwt-based-authentication-not-available": JWT_AUTH_UNAVAILABLE_ERROR,
  "error-fe-received-response-object": JWT_RESPONSE_OBJECT_ERROR,
  "error-fe-received-non-json-object": JWT_NON_JSON_ERROR,
  "question-not-found": QUESTION_NOT_FOUND_ERROR,
  "dashboard-not-found": DASHBOARD_NOT_FOUND_ERROR,
  "error-fe-cannot-authenticate": CANNOT_AUTHENTICATE_ERROR,
  "error-fe-bad-jwt-provider-uri": BAD_JWT_PROVIDER_URI_ERROR,
  "error-fe-cannot-refresh-token": CANNOT_REFRESH_TOKEN_ERROR,
  "error-unknown": UNKNOWN_ERROR,
} as const;

export const getErrorInfo = (status: SdkErrorStatus): ErrorInfo => {
  return ERROR_INFO[status] || UNKNOWN_ERROR;
};
