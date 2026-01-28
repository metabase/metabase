import type { Location } from "history";
import { replace } from "react-router-redux";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import { DependencyList } from "../../components/DependencyList";
import type {
  DependencyListMode,
  DependencyListParamsOptions,
} from "../../components/DependencyList/types";

import type { DependencyListQueryParams } from "./types";
import {
  extractUserParams,
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
  const dispatch = useDispatch();

  const {
    value: lastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "dependency_list",
    key: mode,
  });

  const params = isEmptyParams(location.query)
    ? parseUserParams(lastUsedParams)
    : parseUrlParams(location.query);

  const handleParamsChange = (
    params: Urls.DependencyListParams,
    { withSetLastUsedParams = false }: DependencyListParamsOptions = {},
  ) => {
    const url =
      mode === "broken"
        ? Urls.brokenDependencies(params)
        : Urls.unreferencedDependencies(params);
    dispatch(replace(url));

    if (withSetLastUsedParams) {
      setLastUsedParams(extractUserParams(params));
    }
  };

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
