import { MetabaseError } from "./base";

export function INVALID_SESSION_OBJECT(params: {
  expected?: string;
  actual?: string;
}) {
  return new MetabaseError(
    "INVALID_SESSION_OBJECT",
    `Session object invalid. Expected: ${params.expected}, Actual: ${params.actual}`,
    params,
  );
}

export function INVALID_SESSION_SCHEMA(params: {
  expected?: string;
  actual?: string;
}) {
  return new MetabaseError(
    "INVALID_SESSION_SCHEMA",
    `Session schema invalid. Expected: ${params.expected}, Actual: ${params.actual}`,
    params,
  );
}

export function REFRESH_TOKEN_BACKEND_ERROR(params: {
  status?: string;
  message?: string;
}) {
  const errorMessage =
    params.message ||
    `Backend returned an error when refreshing the token.${params.status ? ` Status: ${params.status}` : ""}`;

  return new MetabaseError("BACKEND_ERROR_STATUS", errorMessage, params);
}

export function CUSTOM_FETCH_REQUEST_TOKEN_ERROR(params: {
  expected?: string;
  actual?: string;
}) {
  return new MetabaseError(
    "CUSTOM_FETCH_ERROR",
    `Your fetchRefreshToken function must return an object with the shape { jwt: string }${params.actual ? `, but instead received ${params.actual}` : ``}`,
    params,
  );
}

export function DEFAULT_ENDPOINT_ERROR(params: {
  expected?: string;
  actual?: string;
}) {
  return new MetabaseError(
    "DEFAULT_ENDPOINT_ERROR",
    `Your JWT server endpoint must return an object with the shape { jwt: string }${params.actual ? `, but instead received ${params.actual}` : ``}`,
    params,
  );
}

// New error type for errors during the fetch process (network issues, non-OK http status)
export function CANNOT_FETCH_JWT_TOKEN(params: {
  url: string;
  status?: string;
  message?: string;
}) {
  const statusMessage = params.status ? `, status: ${params.status}` : "";
  const detailedMessage = params.message ? `, message: ${params.message}` : "";
  return new MetabaseError(
    "CANNOT_FETCH_JWT_TOKEN",
    `Failed to fetch JWT token from ${params.url}${statusMessage}${detailedMessage}.`,
    params,
  );
}
