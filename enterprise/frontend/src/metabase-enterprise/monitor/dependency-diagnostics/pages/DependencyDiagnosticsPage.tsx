import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/current-user";
import { useLocation, useNavigate } from "metabase/router";
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
  const navigate = useNavigate();

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
    navigate(getPageUrl(mode, params), { replace: true });
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      navigate(getPageUrl(mode, params), { replace: true });
    }
  }, [mode, params, isLoadingParams, navigate]);

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
