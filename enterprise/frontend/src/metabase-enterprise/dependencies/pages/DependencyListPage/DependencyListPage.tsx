import type { Location } from "history";
import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import type * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing/compat";

import { DependencyList } from "../../components/DependencyList";
import type {
  DependencyListMode,
  DependencyListParamsOptions,
} from "../../components/DependencyList/types";

import {
  getPageUrl,
  getUserParams,
  isEmptyParams,
  parseUrlParams,
  parseUserParams,
} from "./utils";

type DependencyListPageProps = {
  location: Location;
};

type DependencyListPageOwnProps = DependencyListPageProps & {
  mode: DependencyListMode;
};

function DependencyListPage({ mode, location }: DependencyListPageOwnProps) {
  const { replace } = useNavigation();
  const isInitializingRef = useRef(false);

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
    params: Urls.DependencyListParams,
    { withSetLastUsedParams = false }: DependencyListParamsOptions = {},
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
    <DependencyList
      mode={mode}
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}

export function BrokenDependencyListPage({
  location,
}: DependencyListPageProps) {
  return <DependencyListPage mode="broken" location={location} />;
}

export function UnreferencedDependencyListPage({
  location,
}: DependencyListPageProps) {
  return <DependencyListPage mode="unreferenced" location={location} />;
}
