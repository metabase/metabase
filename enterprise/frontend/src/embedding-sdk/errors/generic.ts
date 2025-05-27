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
