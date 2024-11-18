import { useMemo } from "react";

import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector";

import { useInteractiveQuestionContext } from "../context";

export const useSensibleVisualizations = () => {
  const { queryResults } = useInteractiveQuestionContext();

  const result = queryResults?.[0];

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result }),
    [result],
  );

  return {
    sensibleVisualizations,
    nonSensibleVisualizations,
  };
};
