import type { Location } from "history";
import { useEffect, useMemo, useRef } from "react";
import { replace } from "react-router-redux";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/lib/redux";
import type * as Urls from "metabase/lib/urls";

import { DependencyList } from "../../components/DependencyList";
import type {
  DependencyListMode,
  DependencyListParamsOptions,
} from "../../components/DependencyList/types";

import type { DependencyListQueryParams } from "./types";
import {
  getPageUrl,
  getUserParams,
  isEmptyParams,
  parseUrlParams,
  parseUserParams,
} from "./utils";

type DependencyListPageProps = {
  location: Pick<Location<DependencyListQueryParams>, "query">;
};

type DependencyListPageOwnProps = DependencyListPageProps & {
  mode: DependencyListMode;
};

export function DependencyListPage({
  mode,
  location,
}: DependencyListPageOwnProps) {
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
    return isEmptyParams(location.query)
      ? parseUserParams(rawLastUsedParams)
      : parseUrlParams(location.query);
  }, [location.query, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.DependencyListParams,
    { withSetLastUsedParams = false }: DependencyListParamsOptions = {},
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
