import type { Location } from "history";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useListUnreferencedGraphNodesQuery } from "metabase-enterprise/api";

import {
  DependencyListView,
  type DependencyListViewParams,
} from "../../components/DependencyListView";
import type { DependencyListRawParams } from "../../types";
import {
  getCardTypes,
  getDependencyTypes,
  parseDependencyListParams,
} from "../../utils";

import { AVAILABLE_GROUP_TYPES, PAGE_SIZE } from "./constants";

type UnreferencedDependencyListPageProps = {
  location: Location<DependencyListRawParams>;
};

export function UnreferencedDependencyListPage({
  location,
}: UnreferencedDependencyListPageProps) {
  const params = parseDependencyListParams(location.query);
  const {
    query = "",
    groupTypes = AVAILABLE_GROUP_TYPES,
    pageIndex = 0,
  } = params;
  const dispatch = useDispatch();

  const { data, isFetching, isLoading, error } =
    useListUnreferencedGraphNodesQuery({
      query,
      types: getDependencyTypes(groupTypes),
      card_types: getCardTypes(groupTypes),
      offset: pageIndex * PAGE_SIZE,
      limit: PAGE_SIZE,
    });

  const handleParamsChange = (
    params: DependencyListViewParams,
    withReplace?: boolean,
  ) => {
    const newUrl = Urls.dataStudioUnreferencedItems(params);
    dispatch(withReplace ? replace(newUrl) : push(newUrl));
  };

  return (
    <DependencyListView
      nodes={data?.data ?? []}
      params={params}
      error={error}
      availableGroupTypes={AVAILABLE_GROUP_TYPES}
      nothingFoundMessage={t`No unreferenced entities found.`}
      pageSize={PAGE_SIZE}
      totalNodes={data?.total ?? 0}
      isFetching={isFetching}
      isLoading={isLoading}
      onParamsChange={handleParamsChange}
    />
  );
}
