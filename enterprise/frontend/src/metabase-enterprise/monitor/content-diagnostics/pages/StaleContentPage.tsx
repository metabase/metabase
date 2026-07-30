import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/redux";
import { replace, useRouter } from "metabase/router";
import * as Urls from "metabase/urls";

import { StaleContentDiagnostics } from "../components";
import { getStaleParamsWithoutDefaults } from "../components/stale-utils";
import type { ContentDiagnosticsParamsOptions } from "../components/types";

import {
  getStaleUserParams,
  isEmptyStaleParams,
  parseStaleUrlParams,
  parseStaleUserParams,
} from "./utils";

export function StaleContentPage() {
  const { location } = useRouter();
  const isInitializingRef = useRef(false);
  const dispatch = useDispatch();

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: "stale",
  });

  const params = useMemo(() => {
    return isEmptyStaleParams(location)
      ? parseStaleUserParams(rawLastUsedParams)
      : parseStaleUrlParams(location);
  }, [location, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.StaleContentParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    const paramsWithoutDefaults = getStaleParamsWithoutDefaults(params);

    if (withSetLastUsedParams) {
      setLastUsedParams(getStaleUserParams(paramsWithoutDefaults));
    }
    dispatch(replace(Urls.staleContent(paramsWithoutDefaults)));
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      dispatch(
        replace(Urls.staleContent(getStaleParamsWithoutDefaults(params))),
      );
    }
  }, [params, isLoadingParams, dispatch]);

  return (
    <StaleContentDiagnostics
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
