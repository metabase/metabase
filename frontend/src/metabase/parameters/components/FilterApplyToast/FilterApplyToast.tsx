import { useCallback } from "react";
import { t } from "ttag";

import { Toast } from "metabase/common/components/Toaster/Toaster";
import { applyDraftParameterValues } from "metabase/dashboard/actions";
import { setParameterValues } from "metabase/dashboard/actions/parameters";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getDraftParameterValues,
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { getFilterChangeDescription } from "./utils";

interface FilterApplyToastProps {
  position?: "absolute" | "fixed";
}

export function FilterApplyToast({
  position = "absolute",
}: FilterApplyToastProps) {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const hasUnappliedParameterValues = useSelector(
    getHasUnappliedParameterValues,
  );
  const currentParameterValues = useSelector(getParameterValues);
  const draftParameterValues = useSelector(getDraftParameterValues);

  const { isEditing } = useDashboardContext();

  const dispatch = useDispatch();
  const handleApplyFilters = useCallback(() => {
    dispatch(applyDraftParameterValues());
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    dispatch(setParameterValues(currentParameterValues));
  }, [currentParameterValues, dispatch]);

  if (isAutoApplyFilters || !hasUnappliedParameterValues || isEditing) {
    return null;
  }

  const filterChangeDescription = getFilterChangeDescription(
    currentParameterValues,
    draftParameterValues,
  );

  return (
    <Toast
      show
      canClose={false}
      data-testid="filter-apply-toast"
      message={filterChangeDescription}
      confirmText={t`Apply`}
      secondaryText={t`Cancel`}
      confirmAriaLabel={t`Apply`}
      secondaryAriaLabel={t`Cancel`}
      onConfirm={handleApplyFilters}
      onSecondary={handleCancel}
      style={{
        position,
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 4,
      }}
    />
  );
}
