import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Flex, TextInput } from "metabase/ui";
import {
  addCard,
  removeCard,
  selectCardIds,
} from "metabase/visualizer/visualizer.slice";

import { RecentsList } from "./RecentsList";
import type { ResultsItem, ResultsListProps } from "./ResultsList";
import { SearchResultsList } from "./SearchResultsList";

export const DataImporter = () => {
  const dispatch = useDispatch();
  const selectedCardIds = useSelector(selectCardIds);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const handleCardSelect: ResultsListProps["onSelect"] = useCallback(
    (item: ResultsItem) => {
      if (typeof item.id !== "number") {
        throw new Error(`Search item with invalid id: ${JSON.stringify(item)}`);
      }
      if (selectedCardIds.has(item.id)) {
        dispatch(removeCard(item.id));
      } else {
        dispatch(addCard(item.id));
      }
    },
    [dispatch, selectedCardIds],
  );

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(e => {
      setSearch(e.target.value);
    }, []);

  const showRecents = search.trim() === "";

  return (
    <Flex
      direction="column"
      bg="white"
      style={{ borderRadius: "var(--default-border-radius)", height: "100%" }}
    >
      <TextInput
        m={8}
        variant="filled"
        value={search}
        onChange={handleSearchChange}
        placeholder={t`Search for something`}
      />
      <Flex
        direction="column"
        px={8}
        style={{
          overflowY: "auto",
        }}
      >
        {showRecents ? (
          <RecentsList
            onSelect={handleCardSelect}
            selectedCardIds={selectedCardIds}
          />
        ) : (
          <SearchResultsList
            search={debouncedSearch}
            onSelect={handleCardSelect}
            selectedCardIds={selectedCardIds}
          />
        )}
      </Flex>
    </Flex>
  );
};
