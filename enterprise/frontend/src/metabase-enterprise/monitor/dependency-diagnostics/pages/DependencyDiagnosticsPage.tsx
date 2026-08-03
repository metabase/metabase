import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/redux";
import { replace, useLocation } from "metabase/router";
import type * as Urls from "metabase/urls";
import { DependencyDiagnostics } from "metabase-enterprise/monitor/dependency-diagnostics/components";
import type {
  DependencyDiagnosticsMode,
  DependencyDiagnosticsParamsOptions,
} from "metabase-enterprise/monitor/dependency-diagnostics/components/types";

import {
  getPageUrl,
  getUserParams,
  isEmptyParams,
  parseUrlParams,
  parseUserParams,
} from "./utils";

type DependencyDiagnosticsPageProps = {
  mode: DependencyDiagnosticsMode;
};

function DependencyDiagnosticsPage({ mode }: DependencyDiagnosticsPageProps) {
  const location = useLocation();
  const isInitializingRef = useRef(false);
  const dispatch = useDispatch();

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "dependency_diagnostics",
    key: mode,
  });

  const params = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return isEmptyParams(searchParams)
      ? parseUserParams(rawLastUsedParams)
      : parseUrlParams(searchParams);
  }, [location.search, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.DependencyDiagnosticsParams,
    { withSetLastUsedParams = false }: DependencyDiagnosticsParamsOptions = {},
  ) => {
    if (withSetLastUsedParams) {
      setLastUsedParams(getUserParams(params));
    }
    dispatch(replace(getPageUrl(mode, params)));
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      dispatch(replace(getPageUrl(mode, params)));
    }
  }, [mode, params, isLoadingParams, dispatch]);

  return (
    <DependencyDiagnostics
      mode={mode}
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}

export function BrokenDependencyDiagnosticsPage() {
  return <DependencyDiagnosticsPage mode="broken" />;
}

export function UnreferencedDependencyDiagnosticsPage() {
  return <DependencyDiagnosticsPage mode="unreferenced" />;
}
