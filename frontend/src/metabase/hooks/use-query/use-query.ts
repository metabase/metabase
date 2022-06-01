import { useState, useEffect, useCallback, useMemo } from "react";
import _ from "underscore";

import { useOnMount } from "metabase/hooks/use-on-mount";
import { useMostRecentCall } from "metabase/hooks/use-most-recent-call";

type QueryFn = (searchStr?: string) => Promise<any[]>;

export type UseSearchOptions = {
  filterDebounce?: number;
  maxNumSearchResults?: number;
  fetchTrigger?: "none" | "mount" | "input" | "mount input";
  labelKey?: string;
};

export type UseQueryReturn = {
  status: SearchStatus;
  input: string | undefined;
  setInput: (str: string) => void;
  results: any[];
};

type SearchStatus = "INIT" | "LOADING" | "RESOLVED" | "ERROR";

const DEFAULT_FILTER_DEBOUNCE = 500;
const MAX_NUM_SEARCH_RESULTS = 100;

export function useQuery(
  _fetchValues: QueryFn,
  {
    filterDebounce = DEFAULT_FILTER_DEBOUNCE,
    maxNumSearchResults = MAX_NUM_SEARCH_RESULTS,
    fetchTrigger = "input",
    labelKey,
  }: UseSearchOptions = {},
): UseQueryReturn {
  const [status, setStatus] = useState<SearchStatus>("INIT");
  const [results, setResults] = useState<any[]>([]);
  const [input, setInput] = useState<string>();
  const [lastUsedInput, setLastUsedInput] = useState<string>();

  const triggerFetchOnMount = fetchTrigger.includes("mount");
  const triggerFetchOnInput = fetchTrigger.includes("input");

  const fetchValues = useMostRecentCall(_fetchValues);

  const fetchFilteredResults = useCallback(
    async (filterString?: string) => {
      try {
        setStatus("LOADING");
        const newResults = await fetchValues(filterString);
        setStatus("RESOLVED");
        setResults(newResults);
      } catch (err) {
        setStatus("ERROR");
      }
    },
    [fetchValues],
  );

  const debouncedFetchFilteredResults = useMemo(
    () => _.debounce(fetchFilteredResults, filterDebounce),
    [fetchFilteredResults, filterDebounce],
  );

  const filterResults = useCallback(
    filterString => {
      const lowerCaseSearchStr = String(filterString).toLowerCase();
      const filteredResults = results.filter(result => {
        const value = labelKey ? result[labelKey] : result;

        return String(value)
          .toLowerCase()
          .includes(lowerCaseSearchStr);
      });

      setResults(filteredResults);
    },
    [labelKey, results],
  );

  useOnMount(() => {
    if (triggerFetchOnMount) {
      fetchFilteredResults();
    }
  });

  useEffect(() => {
    if (input === undefined || lastUsedInput === lastUsedInput) {
      return;
    }

    setLastUsedInput(input);

    const hasFewerThanMaxResults = results.length < maxNumSearchResults;
    const isExtensionOfLastSearch = lastUsedInput
      ? input.startsWith(lastUsedInput)
      : false;

    if (
      !triggerFetchOnInput ||
      (isExtensionOfLastSearch && hasFewerThanMaxResults)
    ) {
      filterResults(input);
    } else {
      debouncedFetchFilteredResults(input);
    }
  }, [
    triggerFetchOnInput,
    input,
    lastUsedInput,
    debouncedFetchFilteredResults,
    maxNumSearchResults,
    results,
    filterResults,
  ]);

  return {
    input,
    setInput,
    status,
    results,
  };
}
