import type { Location } from "history";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useListBrokenGraphNodesQuery } from "metabase-enterprise/api";

import {
  DependencyListView,
  type DependencyListViewParams,
} from "../../components/DependencyListView";
import { getCardTypes, getDependencyTypes } from "../../utils";

import { AVAILABLE_GROUP_TYPES, PAGE_SIZE } from "./constants";
import type { BrokenDependencyListRawParams } from "./types";
import { parseRawParams } from "./utils";

type BrokenDependencyListPageProps = {
  location: Location<BrokenDependencyListRawParams>;
};

export function BrokenDependencyListPage({
  location,
}: BrokenDependencyListPageProps) {
  const params = parseRawParams(location.query);
  const { query = "", types, pageIndex = 0 } = params;
  const dispatch = useDispatch();

  const { data, isFetching, isLoading, error } = useListBrokenGraphNodesQuery({
    query,
    types: getDependencyTypes(types ?? AVAILABLE_GROUP_TYPES),
    card_types: getCardTypes(types ?? AVAILABLE_GROUP_TYPES),
    offset: pageIndex * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const handleParamsChange = (
    params: DependencyListViewParams,
    withReplace?: boolean,
  ) => {
    const newUrl = Urls.dataStudioBrokenItems(params);
    dispatch(withReplace ? replace(newUrl) : push(newUrl));
  };

  return (
    <DependencyListView
      nodes={data?.data ?? []}
      params={params}
      error={error}
      availableGroupTypes={AVAILABLE_GROUP_TYPES}
      nothingFoundMessage={t`No broken entities found.`}
      pageSize={PAGE_SIZE}
      totalNodes={data?.total ?? 0}
      isFetching={isFetching}
      isLoading={isLoading}
      withErrorsColumn
      withDependentsCountColumn
      onParamsChange={handleParamsChange}
    />
  );
}
