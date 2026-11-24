import { useMemo } from "react";

import { useDashboardContext } from "metabase/dashboard/context";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

export function useLinkedFilterParameters() {
  const { parameters, parameterValues } = useDashboardContext();

  return useMemo(
    () => getValuePopulatedParameters({ parameters, values: parameterValues }),
    [parameters, parameterValues],
  );
}
