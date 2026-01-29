import { useMemo } from "react";

import { useListRecentsQuery } from "metabase/api";
import { Box } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerItem } from "../../types";
import { DEFAULT_RECENTS_CONTEXT } from "../EntityPickerModal";

import { SearchResults } from "./SearchResults";

const MAX_RECENTS = 20;

const makeIntoPickerItem = (item: RecentItem): OmniPickerItem => {
  if (item.model !== "table") {
    return {
      ...item,
      collection: {
        ...item.parent_collection,
        id: item.parent_collection?.id ?? "root",
      },
      dashboard_id: item.dashboard?.id,
    };
  }
  return {
    ...item,
    name: item.display_name ?? item.name,
    database_name: item.database.name,
    database_id: item.database.id,
    schema: item.table_schema,
  };
};

export const RecentsItemList = () => {
  const { isHiddenItem, isDisabledItem, isSelectableItem, recentsContext } =
    useOmniPickerContext();

  const {
    data: results,
    error,
    isLoading,
  } = useListRecentsQuery({
    context: recentsContext ?? DEFAULT_RECENTS_CONTEXT,
  });

  const filteredResults = useMemo(() => {
    return (
      results
        ?.map(makeIntoPickerItem)
        .filter(
          // don't show something you can't pick at all
          (item) =>
            isSelectableItem(item) &&
            !isHiddenItem(item) &&
            !isDisabledItem(item),
        )
        .slice(0, MAX_RECENTS) ?? []
    );
  }, [results, isHiddenItem, isDisabledItem, isSelectableItem]);

  return (
    <Box h="100%" w="40rem">
      <SearchResults
        searchResults={filteredResults}
        isLoading={isLoading}
        error={error}
      />
    </Box>
  );
};
