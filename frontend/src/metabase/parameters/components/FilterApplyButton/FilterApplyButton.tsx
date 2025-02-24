import { useCallback } from "react";
import { t } from "ttag";

import DeprecatedButton from "metabase/core/components/Button/Button";
import { applyDraftParameterValues } from "metabase/dashboard/actions";
import {
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import S from "./FilterApplyButton.module.css";

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
    <DeprecatedButton
      className={S.ApplyButton}
      primary
      onClick={handleApplyFilters}
    >
      {t`Apply`}
    </DeprecatedButton>
  );
}
