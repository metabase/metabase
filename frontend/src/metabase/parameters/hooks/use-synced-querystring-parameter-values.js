import { useEffect } from "react";
import querystring from "querystring";

import { getParameterValuesBySlug } from "metabase/parameters/utils/parameter-values";

export function useSyncedQuerystringParameterValues({
  parameters,
  parameterValues,
  dashboard,
}) {
  useEffect(() => {
    const parameterValuesBySlug = getParameterValuesBySlug(
      parameters,
      parameterValues,
      dashboard && { preserveDefaultedParameters: true },
    );

    const searchString = buildSearchString(parameterValuesBySlug);

    if (searchString !== window.location.search) {
      history.replaceState(
        null,
        document.title,
        window.location.pathname + searchString + window.location.hash,
      );
    }
  }, [parameters, parameterValues, dashboard]);
}

function buildSearchString(parameterValuesBySlug) {
  const search = querystring.stringify(parameterValuesBySlug);
  return search ? `?${search}` : "";
}
