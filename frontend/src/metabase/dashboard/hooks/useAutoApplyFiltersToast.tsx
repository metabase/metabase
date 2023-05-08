import { useEffect } from "react";
import { t } from "ttag";

import { useSelector, useDispatch } from "metabase/lib/redux";
import { getIsReadyToShowAutoApplyFiltersToast } from "metabase/dashboard/selectors";
import { toggleAutoApplyFilters } from "metabase/dashboard/actions";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export default function useAutoApplyFiltersToast() {
  const isReadyToShow = useSelector(getIsReadyToShowAutoApplyFiltersToast);
  const dispatch = useDispatch();
  const toastId = useUniqueId();

  useEffect(() => {
    if (isReadyToShow) {
      const action = toggleAutoApplyFilters(false);

      dispatch(
        addUndo({
          id: toastId,
          timeout: false,
          message: t`You can make this dashboard snappier by turning off auto-applying filters.`,
          action,
          actionLabel: t`Turn off`,
        }),
      );

      return () => {
        dispatch(dismissUndo(toastId, false));
      };
    }
  }, [toastId, dispatch, isReadyToShow]);
}
