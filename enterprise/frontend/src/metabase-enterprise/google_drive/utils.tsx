import { P, match } from "ts-pattern";

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
