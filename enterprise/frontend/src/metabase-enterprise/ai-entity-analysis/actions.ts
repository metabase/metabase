import { setSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import type { DashCardId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

export const showDashCardAnalysisSidebar =
  (dashcardId: DashCardId) => (dispatch: Dispatch) => {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.analyze,
        props: { dashcardId },
      }),
    );
  };
