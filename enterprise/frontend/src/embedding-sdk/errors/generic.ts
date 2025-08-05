import { MetabaseError } from "./base";

export function USER_FETCH_FAILED() {
  return new MetabaseError(
    "USER_FETCH_FAILED",
    "Failed to fetch the user, the session might be invalid.",
  );
}

export function CANNOT_CONNECT_TO_INSTANCE({
  instanceUrl,
  status,
  message,
}: {
  instanceUrl: string;
  status?: number;
  message?: string;
}) {
  // If error status is 500 (internal server error) or no message is provided,
  // we provide a generic error message.
  const errorMessage =
    !message || status === 500
      ? `Unable to connect to instance at ${instanceUrl}${status ? ` (status: ${status})` : ""}`
      : message;

  return new MetabaseError("CANNOT_CONNECT_TO_INSTANCE", errorMessage, {
    status,
  });
}

export function INVALID_AUTH_METHOD({ method }: { method: string }) {
  return new MetabaseError(
    "INVALID_AUTH_METHOD",
    `Invalid auth method: '${method}'. Allowed values are 'saml' or 'jwt'.`,
    { method },
  );
}

export function AUTH_TIMEOUT() {
  return new MetabaseError(
    "AUTH_TIMEOUT",
    "Authentication has not been completed in time.",
  );
}
