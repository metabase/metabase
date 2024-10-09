import { useCallback, useState } from "react";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Box, TextInput } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import { RecentsList } from "./RecentsList";
import type { ResultsItem, ResultsListProps } from "./ResultsList";
import { SearchResultsList } from "./SearchResultsList";

interface DataImporterProps {
  onSelect: (cardId: CardId) => void;
}

export const DataImporter = ({ onSelect }: DataImporterProps) => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);

  const handleCardSelect: ResultsListProps["onSelect"] = useCallback(
    (item: ResultsItem) => {
      if (typeof item.id !== "number") {
        throw new Error(`Search item with invalid id: ${JSON.stringify(item)}`);
      }
      onSelect(item.id);
    },
    [onSelect],
  );

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> =
    useCallback(e => {
      setSearch(e.target.value);
    }, []);

  const showRecents = search.trim() === "";

  return (
    <Box p={12}>
      <TextInput
        variant="filled"
        value={search}
        onChange={handleSearchChange}
        placeholder={t`Search for something`}
        mb={8}
      />
      {showRecents ? (
        <RecentsList onSelect={handleCardSelect} />
      ) : (
        <SearchResultsList
          search={debouncedSearch}
          onSelect={handleCardSelect}
        />
      )}
    </Box>
  );
};
