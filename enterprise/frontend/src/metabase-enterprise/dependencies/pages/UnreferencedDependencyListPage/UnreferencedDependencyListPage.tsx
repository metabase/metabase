import { useDebouncedCallback } from "@mantine/hooks";
import type { Location } from "history";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  Center,
  Flex,
  Icon,
  Loader,
  Pagination,
  Stack,
  TextInput,
} from "metabase/ui";
import { useListUnreferencedGraphNodesQuery } from "metabase-enterprise/api";

import { DependencyList } from "../../components/DependencyList";
import { DependencyListFilterPicker } from "../../components/DependencyListFilterPicker";
import { DependencyListHeader } from "../../components/DependencyListHeader";
import { ListEmptyState } from "../../components/ListEmptyState";
import type { DependencyListFilterOptions } from "../../types";
import { getCardTypes, getDependencyTypes, getSearchQuery } from "../../utils";

import S from "./UnreferencedDependencyListPage.module.css";
import { AVAILABLE_GROUP_TYPES, PAGE_SIZE } from "./constants";
import type { UnreferencedDependencyListRawParams } from "./types";
import { parseRawParams } from "./utils";

type UnreferencedDependencyListPageProps = {
  location: Location<UnreferencedDependencyListRawParams>;
};

export function UnreferencedDependencyListPage({
  location,
}: UnreferencedDependencyListPageProps) {
  const params = parseRawParams(location.query);
  const { query = "", types, pageIndex = 0 } = params;
  const [searchValue, setSearchValue] = useState("");
  const dispatch = useDispatch();

  const { data, isFetching, isLoading, error } =
    useListUnreferencedGraphNodesQuery({
      query,
      types: getDependencyTypes(types ?? AVAILABLE_GROUP_TYPES),
      card_types: getCardTypes(types ?? AVAILABLE_GROUP_TYPES),
      offset: pageIndex * PAGE_SIZE,
      limit: PAGE_SIZE,
    });

  const pageNumber = pageIndex + 1;
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const filterOptions = useMemo(() => ({ groupTypes: types ?? [] }), [types]);

  const handleSearchDebounce = useDebouncedCallback(
    (query: string | undefined) => {
      dispatch(
        replace(
          Urls.dataStudioUnreferencedItems({ ...params, query, pageIndex: 0 }),
        ),
      );
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const searchValue = event.target.value;
      setSearchValue(searchValue);
      handleSearchDebounce(getSearchQuery(searchValue));
    },
    [handleSearchDebounce],
  );

  const handleFilterOptionsChange = useCallback(
    (filterOptions: DependencyListFilterOptions) => {
      dispatch(
        replace(
          Urls.dataStudioUnreferencedItems({
            ...params,
            types: filterOptions.groupTypes,
            pageIndex: 0,
          }),
        ),
      );
    },
    [params, dispatch],
  );

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      dispatch(
        push(
          Urls.dataStudioUnreferencedItems({
            ...params,
            pageIndex: pageNumber - 1,
          }),
        ),
      );
    },
    [params, dispatch],
  );

  return (
    <Stack className={S.page} flex={1} px="3.5rem" py="md" gap="md" h="100%">
      <DependencyListHeader />
      <Flex gap="md" align="center">
        <TextInput
          value={searchValue}
          placeholder={t`Search…`}
          flex={1}
          leftSection={<Icon name="search" />}
          rightSection={
            isFetching && !isLoading ? <Loader size="sm" /> : undefined
          }
          onChange={handleSearchChange}
        />
        <DependencyListFilterPicker
          filterOptions={filterOptions}
          availableGroupTypes={AVAILABLE_GROUP_TYPES}
          onFilterOptionsChange={handleFilterOptionsChange}
        />
      </Flex>
      {isLoading || !data || data.data.length === 0 ? (
        <Center flex={1}>
          {isLoading ? (
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          ) : (
            <ListEmptyState label={t`No broken entities found.`} />
          )}
        </Center>
      ) : (
        <Stack flex={1} mih={0}>
          <DependencyList nodes={data.data} />
          <Center>
            <Pagination
              value={pageNumber}
              total={totalPages}
              onChange={handlePageChange}
            />
          </Center>
        </Stack>
      )}
    </Stack>
  );
}
