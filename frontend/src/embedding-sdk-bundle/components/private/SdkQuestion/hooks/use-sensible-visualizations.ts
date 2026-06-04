import { useMemo, useRef } from "react";

import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import { isCardDisplayType } from "metabase-types/api";

import { useSdkQuestionContext } from "../context";

export const useSensibleVisualizations = () => {
  const { queryResults } = useSdkQuestionContext();

  const result = queryResults?.[0];

  const initialResultRef = useRef(result);
  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: initialResultRef.current }),

    [],
  );

  // SDK doesn't support custom viz plugins, so only keep built-in card display types.
  return {
    sensibleVisualizations: sensibleVisualizations.filter(isCardDisplayType),
    nonSensibleVisualizations:
      nonSensibleVisualizations.filter(isCardDisplayType),
  };
};
