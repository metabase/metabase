import { useMemo, useRef } from "react";

import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector";
import type { CardDisplayType } from "metabase-types/api";

import { useSdkQuestionContext } from "../context";

export const useSensibleVisualizations = () => {
  const { queryResults } = useSdkQuestionContext();

  const result = queryResults?.[0];

  const initialResultRef = useRef(result);
  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result: initialResultRef.current }),

    [],
  );

  // SDK doesn't support custom viz plugins, so we safely narrow the type here.
  return {
    sensibleVisualizations: sensibleVisualizations as CardDisplayType[],
    nonSensibleVisualizations: nonSensibleVisualizations as CardDisplayType[],
  };
};
