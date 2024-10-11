import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import type { Dispatch } from "metabase-types/store";

import { closeSidebar, setSidebar } from "./ui";

export const setSharing = (isSharing: boolean) => (dispatch: Dispatch) => {
  if (isSharing) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.sharing,
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};
