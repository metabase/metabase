import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/redux";
import type { Location } from "metabase/router";
import { replace } from "metabase/router";
import * as Urls from "metabase/urls";

import { ContentDiagnostics } from "../components";
import type { ContentDiagnosticsParamsOptions } from "../components/types";

import {
  getUserParams,
  isEmptyParams,
  parseUrlParams,
  parseUserParams,
} from "./utils";

type StaleContentPageProps = {
  location: Location;
};

export function StaleContentPage({ location }: StaleContentPageProps) {
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
    return isEmptyParams(location)
      ? parseUserParams(rawLastUsedParams)
      : parseUrlParams(location);
  }, [location, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.ContentDiagnosticsParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    if (withSetLastUsedParams) {
      setLastUsedParams(getUserParams(params));
    }
    dispatch(replace(Urls.staleContent(params)));
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      dispatch(replace(Urls.staleContent(params)));
    }
  }, [params, isLoadingParams, dispatch]);

  return (
    <ContentDiagnostics
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
