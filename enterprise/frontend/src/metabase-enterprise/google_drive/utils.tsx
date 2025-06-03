import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetServiceAccountQuery } from "metabase-enterprise/api";
import type { GdrivePayload } from "metabase-types/api";

export type ErrorPayload =
  | unknown
  | string
  | { data: { message: string } | { error_message: string } | string }
  | { message: string }
  | { error_message: string };

export function useShowGdrive() {
  const gSheetsEnabled = useSetting("show-google-sheets-integration");
  const hasDwh = useHasTokenFeature("attached_dwh");
  const userIsAdmin = useSelector(getUserIsAdmin);

  const shouldGetServiceAccount = gSheetsEnabled && userIsAdmin && hasDwh;

  const { data: serviceAccount } = useGetServiceAccountQuery(
    shouldGetServiceAccount ? undefined : skipToken,
  );

  const showGdrive = Boolean(
    hasDwh && gSheetsEnabled && userIsAdmin && serviceAccount?.email,
  );

  return showGdrive;
}

export const getStatus = ({
  status,
  error,
}: {
  status: GdrivePayload["status"] | undefined | null;
  error?: unknown | null;
}): GdrivePayload["status"] =>
  match({ error: !!error, status })
    .returnType<GdrivePayload["status"]>()
    .with({ error: true }, () => "error")
    .with({ status: P.string.minLength(1) }, ({ status }) => status)
    .otherwise(() => "not-connected");

export const getErrorMessage = (
  payload: ErrorPayload,
  // eslint-disable-next-line no-literal-metabase-strings -- admin UI
  fallback: string = t`Please check that the folder is shared with the Metabase Service Account.`,
): string => {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if ("error_message" in payload && typeof payload.error_message === "string") {
    return payload.error_message;
  }

  if ("data" in payload) {
    return getErrorMessage(payload.data, fallback);
  }

  return fallback;
};
