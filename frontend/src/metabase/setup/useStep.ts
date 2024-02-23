import type { AsyncThunkAction } from "@reduxjs/toolkit";

import { useDispatch, useSelector } from "metabase/lib/redux";

import { goToNextStep, selectStep } from "./actions";
import {
  getIsSetupCompleted,
  getIsStepActive,
  getIsStepCompleted,
} from "./selectors";
import type { SetupStep } from "./types";

export const useStep = (stepName: SetupStep) => {
  const isStepActive = useSelector(state => getIsStepActive(state, stepName));
  const isStepCompleted = useSelector(state =>
    getIsStepCompleted(state, stepName),
  );
  const isSetupCompleted = useSelector(getIsSetupCompleted);
  const dispatch = useDispatch();

  const selectThisStep = () => {
    dispatch(selectStep(stepName));
  };

  const dispatchAndGoNextStep = async (
    submitThunk: AsyncThunkAction<any, any, any>,
  ) => {
    await dispatch(submitThunk).unwrap();
    dispatch(goToNextStep());
  };

  return {
    isStepActive,
    isStepCompleted,
    selectThisStep,
    isSetupCompleted,
    dispatchAndGoNextStep,
  };
};
