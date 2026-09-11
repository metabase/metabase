import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/current-user";
import { useNavigate, useSearchParams } from "metabase/router";
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isInitializingRef = useRef(false);

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: "slow",
  });

  const shouldRestoreLastUsedParamsRef = useRef(
    isEmptySlowParams(searchParams),
  );

  const params = useMemo(() => {
    return shouldRestoreLastUsedParamsRef.current
      ? parseSlowUserParams(rawLastUsedParams)
      : parseSlowUrlParams(searchParams);
  }, [searchParams, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.SlowContentParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    const paramsWithoutDefaults = getSlowParamsWithoutDefaults(params);

    if (withSetLastUsedParams) {
      setLastUsedParams(getSlowUserParams(paramsWithoutDefaults));
    }
    navigate(Urls.slowContent(paramsWithoutDefaults), { replace: true });
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      shouldRestoreLastUsedParamsRef.current = false;
      navigate(Urls.slowContent(getSlowParamsWithoutDefaults(params)), {
        replace: true,
      });
    }
  }, [params, isLoadingParams, navigate]);

  return (
    <SlowContent
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
