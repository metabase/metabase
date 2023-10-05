import { useCallback } from "react";
import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
  getIsNavigatingBackToDashboard,
} from "metabase/dashboard/selectors";
import { applyDraftParameterValues } from "metabase/dashboard/actions";
import { ApplyButton } from "./FilterApplyButton.styled";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function FilterApplyButton() {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const isNavigatingBackToDashboard = useSelector(
    getIsNavigatingBackToDashboard,
  );
  const hasUnappliedParameterValues = useSelector(
    getHasUnappliedParameterValues,
  );

  const dispatch = useDispatch();
  const handleApplyFilters = useCallback(() => {
    dispatch(applyDraftParameterValues());
  }, [dispatch]);

  if (
    isAutoApplyFilters ||
    !hasUnappliedParameterValues ||
    isNavigatingBackToDashboard
  ) {
    return null;
  }

  return (
    <ApplyButton primary onClick={handleApplyFilters}>
      Apply
    </ApplyButton>
  );
}
