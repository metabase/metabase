import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetServiceAccountQuery } from "metabase-enterprise/api";
import type { GdrivePayload } from "metabase-types/api";

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
  payload:
    | unknown
    | string
    | { data: { message: string } | string }
    | { message: string },
  fallback: string = t`Something went wrong`,
): string => {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if ("data" in payload) {
    const data = payload.data;
    if (typeof data === "string") {
      return data;
    }
    if (
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message;
    }
  }

  return fallback;
};
