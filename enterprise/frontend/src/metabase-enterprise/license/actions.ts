import { t } from "ttag";

import { createThunkAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

export const SHOW_LICENSE_ACCEPTED_TOAST =
  "metabase-enterprise/license/SHOW_LICENSE_ACCEPTED_TOAST";
export const showLicenseAcceptedToast = createThunkAction(
  SHOW_LICENSE_ACCEPTED_TOAST,
  () => (dispatch: any) => {
    dispatch(
      addUndo({
        message: t`Your license is active!`,
      }),
    );
  },
);
