import { useMemo } from "react";

import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector";

import { useQuestionContext } from "../context";

export const useSensibleVisualizations = () => {
  const { queryResults } = useQuestionContext();

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
