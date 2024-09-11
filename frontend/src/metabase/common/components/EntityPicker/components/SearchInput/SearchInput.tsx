import { useLayoutEffect, useState } from "react";
import { useDebounce } from "react-use";

import { useSearchQuery } from "metabase/api";
import { Icon, TextInput } from "metabase/ui";
import type {
  SearchModel,
  SearchRequest,
  SearchResult,
} from "metabase-types/api";

const defaultSearchFilter = (results: SearchResult[]) => results;

export function SearchInput({
  searchQuery,
  setSearchQuery,
  setSearchResults,
  models,
  placeholder,
  searchFilter = defaultSearchFilter,
  searchParams = {},
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[] | null) => void;
  models: SearchModel[];
  placeholder: string;
  searchFilter?: (results: SearchResult[]) => SearchResult[];
  searchParams?: Partial<SearchRequest>;
}) {
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useDebounce(() => setDebouncedSearchQuery(searchQuery), 200, [searchQuery]);

  const { data, isFetching } = useSearchQuery(
    {
      q: debouncedSearchQuery,
      models,
      context: "entity-picker",
      ...searchParams,
    },
    {
      skip: !debouncedSearchQuery,
    },
  );

  useLayoutEffect(() => {
    if (data && !isFetching) {
      setSearchResults(searchFilter(data.data));
    } else {
      setSearchResults(null);
    }
  }, [data, isFetching, searchFilter, setSearchResults]);

  return (
    <TextInput
      type="search"
      icon={<Icon name="search" size={16} />}
      miw={400}
      mr="2rem"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value ?? "")}
      placeholder={placeholder}
    />
  );
}
