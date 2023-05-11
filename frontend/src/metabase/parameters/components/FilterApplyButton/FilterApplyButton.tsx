import React, { useCallback } from "react";
import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
} from "metabase/dashboard/selectors";
import { applyDraftParameterValues } from "metabase/dashboard/actions";
import { ApplyButton } from "./FilterApplyButton.styled";

export default function FilterApplyButton() {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const hasUnappliedParameterValues = useSelector(
    getHasUnappliedParameterValues,
  );

  const dispatch = useDispatch();
  const handleApplyFilters = useCallback(() => {
    dispatch(applyDraftParameterValues());
  }, [dispatch]);

  if (isAutoApplyFilters || !hasUnappliedParameterValues) {
    return null;
  }

  return (
    <ApplyButton primary onClick={handleApplyFilters}>
      Apply
    </ApplyButton>
  );
}
