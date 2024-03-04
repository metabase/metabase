import { useDispatch, useSelector } from "metabase/lib/redux";

import { selectStep } from "./actions";
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

  const handleStepSelect = () => {
    dispatch(selectStep(stepName));
  };

  return { isStepActive, isStepCompleted, handleStepSelect, isSetupCompleted };
};
