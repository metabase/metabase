import type { Location } from "history";
import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import type * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing/compat";

import { DependencyDiagnostics } from "../../components/DependencyDiagnostics";
import type {
  DependencyDiagnosticsMode,
  DependencyDiagnosticsParamsOptions,
} from "../../components/DependencyDiagnostics/types";

import {
  getPageUrl,
  getUserParams,
  isEmptyParams,
  parseUrlParams,
  parseUserParams,
} from "./utils";

type DependencyDiagnosticsPageProps = {
  location: Location;
};

type DependencyDiagnosticsPageOwnProps = DependencyDiagnosticsPageProps & {
  mode: DependencyDiagnosticsMode;
};

function DependencyDiagnosticsPage({
  mode,
  location,
}: DependencyDiagnosticsPageOwnProps) {
  const { replace } = useNavigation();
  const isInitializingRef = useRef(false);

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "dependency_diagnostics",
    key: mode,
  });

  const params = useMemo(() => {
    return isEmptyParams(location)
      ? parseUserParams(rawLastUsedParams)
      : parseUrlParams(location);
  }, [location, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.DependencyDiagnosticsParams,
    { withSetLastUsedParams = false }: DependencyDiagnosticsParamsOptions = {},
  ) => {
    if (withSetLastUsedParams) {
      setLastUsedParams(getUserParams(params));
    }
    replace(getPageUrl(mode, params));
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      replace(getPageUrl(mode, params));
    }
  }, [mode, params, isLoadingParams, replace]);

  return (
    <DependencyDiagnostics
      mode={mode}
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}

export function BrokenDependencyDiagnosticsPage({
  location,
}: DependencyDiagnosticsPageProps) {
  return <DependencyDiagnosticsPage mode="broken" location={location} />;
}

export function UnreferencedDependencyDiagnosticsPage({
  location,
}: DependencyDiagnosticsPageProps) {
  return <DependencyDiagnosticsPage mode="unreferenced" location={location} />;
}
