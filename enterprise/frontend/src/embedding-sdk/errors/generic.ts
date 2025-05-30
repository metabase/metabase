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
}: {
  instanceUrl: string;
  status?: number;
}) {
  return new MetabaseError(
    "CANNOT_CONNECT_TO_INSTANCE",
    `Unable to connect to instance at ${instanceUrl}${status ? ` (status: ${status})` : ""}`,
    { status },
  );
}

export function MISSING_AUTH_METHOD({
  method,
  response,
}: {
  method: string;
  response: string;
}) {
  return new MetabaseError(
    "MISSING_AUTH_METHOD",
    `Unknown or missing method: ${method}, response: ${JSON.stringify(response, null, 2)}`,
  );
}
