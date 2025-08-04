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
  const defaultMessage = `Unable to connect to instance at ${instanceUrl}${status ? ` (status: ${status})` : ""}`;

  return new MetabaseError(
    "CANNOT_CONNECT_TO_INSTANCE",
    message ?? defaultMessage,
    { status },
  );
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
