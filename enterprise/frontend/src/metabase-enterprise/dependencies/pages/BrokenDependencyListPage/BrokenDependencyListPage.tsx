import { useDebouncedCallback } from "@mantine/hooks";
import type { Location } from "history";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Center, Flex, Icon, Loader, Stack, TextInput } from "metabase/ui";
import { useListBrokenGraphNodesQuery } from "metabase-enterprise/api";

import { DependencyList } from "../../components/DependencyList";
import { DependencyListFilterPicker } from "../../components/DependencyListFilterPicker";
import { DependencyListHeader } from "../../components/DependencyListHeader";
import { ListEmptyState } from "../../components/ListEmptyState";
import type { DependencyListFilterOptions } from "../../types";
import { getCardTypes, getDependencyTypes, getSearchQuery } from "../../utils";

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
  const { query = "", page = 0, types } = params;
  const [searchValue, setSearchValue] = useState("");
  const dispatch = useDispatch();

  const { data, isFetching, isLoading, error } = useListBrokenGraphNodesQuery({
    query,
    types: getDependencyTypes(types ?? AVAILABLE_GROUP_TYPES),
    card_types: getCardTypes(types ?? AVAILABLE_GROUP_TYPES),
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const filterOptions = useMemo(
    () => ({
      groupTypes: types ?? [],
    }),
    [types],
  );

  const handleSearchDebounce = useDebouncedCallback(
    (query: string | undefined) => {
      dispatch(replace(Urls.dataStudioBrokenItems({ ...params, query })));
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
          Urls.dataStudioBrokenItems({
            ...params,
            types: filterOptions.groupTypes,
          }),
        ),
      );
    },
    [params, dispatch],
  );

  return (
    <Stack flex={1} px="3.5rem" py="md" gap="md" mih={0}>
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
      <Box flex={1} mih={0}>
        {isLoading || !data || data.data.length === 0 ? (
          <Center h="100%">
            {isLoading ? (
              <LoadingAndErrorWrapper loading={isLoading} error={error} />
            ) : (
              <ListEmptyState label={t`No broken entities found.`} />
            )}
          </Center>
        ) : (
          <DependencyList
            nodes={data.data}
            withErrorsColumn
            withDependentsCountColumn
          />
        )}
      </Box>
    </Stack>
  );
}
