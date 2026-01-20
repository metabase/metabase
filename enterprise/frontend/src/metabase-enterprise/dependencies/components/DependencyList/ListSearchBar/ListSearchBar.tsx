import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, memo, useState } from "react";
import { t } from "ttag";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import type * as Urls from "metabase/lib/urls";
import { FixedSizeIcon, Flex, Loader, TextInput } from "metabase/ui";

import { getSearchQuery } from "../../../utils";
import type { DependencyListMode } from "../types";

import { FilterOptionsPicker } from "./FilterOptionsPicker";

type ListSearchBarProps = {
  mode: DependencyListMode;
  params: Urls.DependencyListParams;
  hasLoader: boolean;
  onParamsChange: (params: Urls.DependencyListParams) => void;
};

export const ListSearchBar = memo(function ListSearchBar({
  mode,
  params,
  hasLoader,
  onParamsChange,
}: ListSearchBarProps) {
  const [searchValue, setSearchValue] = useState(params.query ?? "");

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleSearchDebounce(newSearchValue);
  };

  const handleSearchDebounce = useDebouncedCallback(
    (newSearchValue: string) => {
      const newQuery = getSearchQuery(newSearchValue);
      onParamsChange({ ...params, query: newQuery });
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  return (
    <Flex gap="md" align="center">
      <TextInput
        value={searchValue}
        placeholder={t`Search…`}
        flex={1}
        leftSection={<FixedSizeIcon name="search" />}
        rightSection={hasLoader ? <Loader size="sm" /> : undefined}
        data-testid="dependency-list-search-input"
        onChange={handleSearchChange}
      />
      <FilterOptionsPicker
        mode={mode}
        params={params}
        onParamsChange={onParamsChange}
      />
    </Flex>
  );
});
