import React, { useCallback, useRef } from "react";
import { CSSTransition } from "react-transition-group";
import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  getHasUnappliedParameterValues,
  getIsAutoApplyFilters,
} from "metabase/dashboard/selectors";
import { applyDraftParameterValues } from "metabase/dashboard/actions";
import {
  ApplyButton,
  BUTTON_TRANSITION_DURATION,
  TRANSITION_CLASSNAMES_PREFIX,
} from "./FilterApplyButton.styled";

export default function FilterApplyButton() {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const hasUnappliedParameterValues = useSelector(
    getHasUnappliedParameterValues,
  );

  const dispatch = useDispatch();
  const handleApplyFilters = useCallback(() => {
    dispatch(applyDraftParameterValues());
  }, [dispatch]);

  const applyButtonRef = useRef(null);

  return (
    <CSSTransition
      in={!isAutoApplyFilters}
      unmountOnExit
      classNames={TRANSITION_CLASSNAMES_PREFIX}
      timeout={{
        enter: BUTTON_TRANSITION_DURATION,
        exit: BUTTON_TRANSITION_DURATION,
      }}
      nodeRef={applyButtonRef}
    >
      <ApplyButton
        ref={applyButtonRef}
        primary
        isVisible={hasUnappliedParameterValues}
        onClick={handleApplyFilters}
      >
        Apply
      </ApplyButton>
    </CSSTransition>
  );
}
