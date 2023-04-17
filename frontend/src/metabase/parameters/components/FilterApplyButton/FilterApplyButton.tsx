import React, { useCallback, useRef } from "react";
import _ from "underscore";
import { CSSTransition } from "react-transition-group";
import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  getDashboardComplete,
  getDraftParameterValues,
  getParameterValues,
} from "metabase/dashboard/selectors";
import { setParameterValues } from "metabase/dashboard/actions";
import {
  ApplyButton,
  BUTTON_TRANSITION_DURATION,
  TRANSITION_CLASSNAMES_PREFIX,
} from "./FilterApplyButton.styled";

export default function FilterApplyButton() {
  const isAutoApplyFilters = useSelector(
    state => getDashboardComplete(state).auto_apply_filters,
  );

  const hasUnappliedParameterValues = useSelector(state => {
    const draftParameterValues = getDraftParameterValues(state);
    const parameterValues = getParameterValues(state);
    return !_.isEqual(draftParameterValues, parameterValues);
  });

  const dispatch = useDispatch();
  const handleApplyFilters = useCallback(() => {
    dispatch((_, getState) => {
      const draftParameterValues = getDraftParameterValues(getState());
      dispatch(setParameterValues(draftParameterValues));
    });
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
