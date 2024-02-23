import { useCallback } from "react";
import { t } from "ttag";

import { applyDraftParameterValues } from "metabase/dashboard/actions";
import {
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { ApplyButton } from "./FilterApplyButton.styled";

export function FilterApplyButton() {
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
      {t`Apply`}
    </ApplyButton>
  );
}
