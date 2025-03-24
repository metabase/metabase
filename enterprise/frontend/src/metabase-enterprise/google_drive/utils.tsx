import { skipToken } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetServiceAccountQuery } from "metabase-enterprise/api";

export function useShowGdrive() {
  const gSheetsSetting = useSetting("gsheets");
  const gSheetsEnabled = useSetting("show-google-sheets-integration");
  const userIsAdmin = useSelector(getUserIsAdmin);

  const shouldGetServiceAccount = gSheetsEnabled && userIsAdmin;

  const { data: { email: serviceAccountEmail } = {} } =
    useGetServiceAccountQuery(shouldGetServiceAccount ? undefined : skipToken);

  const showGdrive = Boolean(
    gSheetsEnabled &&
      gSheetsSetting?.status &&
      userIsAdmin &&
      serviceAccountEmail,
  );

  return showGdrive;
}
