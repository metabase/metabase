import { useMemo, useRef } from "react";

import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector";

import { useSdkQuestionContext } from "../context";

export const useSensibleVisualizations = () => {
  const { queryResults } = useSdkQuestionContext();

  const result = queryResults?.[0];

  const initialResultRef = useRef(result);
  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: initialResultRef.current }),

    [],
  );

  return {
    sensibleVisualizations,
    nonSensibleVisualizations,
  };
};
