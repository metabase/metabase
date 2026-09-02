import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/current-user";
import { useNavigate, useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";

import { StaleContent } from "../components";
import { getStaleParamsWithoutDefaults } from "../components/stale-utils";
import type { ContentDiagnosticsParamsOptions } from "../components/types";

import {
  getStaleUserParams,
  isEmptyStaleParams,
  parseStaleUrlParams,
  parseStaleUserParams,
} from "./utils";

export function StaleContentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isInitializingRef = useRef(false);

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: "stale",
  });

  const shouldRestoreLastUsedParamsRef = useRef(
    isEmptyStaleParams(searchParams),
  );

  const params = useMemo(() => {
    return shouldRestoreLastUsedParamsRef.current
      ? parseStaleUserParams(rawLastUsedParams)
      : parseStaleUrlParams(searchParams);
  }, [searchParams, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.StaleContentParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    const paramsWithoutDefaults = getStaleParamsWithoutDefaults(params);

    if (withSetLastUsedParams) {
      setLastUsedParams(getStaleUserParams(paramsWithoutDefaults));
    }
    navigate(Urls.staleContent(paramsWithoutDefaults), { replace: true });
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      shouldRestoreLastUsedParamsRef.current = false;
      navigate(Urls.staleContent(getStaleParamsWithoutDefaults(params)), {
        replace: true,
      });
    }
  }, [params, isLoadingParams, navigate]);

  return (
    <StaleContent
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
