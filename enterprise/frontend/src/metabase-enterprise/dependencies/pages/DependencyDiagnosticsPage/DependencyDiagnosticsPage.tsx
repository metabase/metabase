import type { Location } from "history";
import { useEffect, useMemo, useRef } from "react";
import { replace } from "react-router-redux";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/lib/redux";
import type * as Urls from "metabase/lib/urls";

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
  const isInitializingRef = useRef(false);
  const dispatch = useDispatch();

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "dependency_list",
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
