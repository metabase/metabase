import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/redux";
import { replace, useRouter } from "metabase/router";
import * as Urls from "metabase/urls";

import { SlowContent } from "../components";
import { getSlowParamsWithoutDefaults } from "../components/slow-utils";
import type { ContentDiagnosticsParamsOptions } from "../components/types";

import {
  getSlowUserParams,
  isEmptySlowParams,
  parseSlowUrlParams,
  parseSlowUserParams,
} from "./slow-utils";

export function SlowContentPage() {
  const { location } = useRouter();
  const isInitializingRef = useRef(false);
  const dispatch = useDispatch();

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: "slow",
  });

  const params = useMemo(() => {
    return isEmptySlowParams(location)
      ? parseSlowUserParams(rawLastUsedParams)
      : parseSlowUrlParams(location);
  }, [location, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.SlowContentParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    const paramsWithoutDefaults = getSlowParamsWithoutDefaults(params);

    if (withSetLastUsedParams) {
      setLastUsedParams(getSlowUserParams(paramsWithoutDefaults));
    }
    dispatch(replace(Urls.slowContent(paramsWithoutDefaults)));
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      dispatch(replace(Urls.slowContent(getSlowParamsWithoutDefaults(params))));
    }
  }, [params, isLoadingParams, dispatch]);

  return (
    <SlowContent
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
