import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import { NoObjectError } from "metabase/components/errors/NoObjectError";
import { trackSearchClick } from "metabase/search/analytics";
import { Box, Flex, Stack } from "metabase/ui";
import type { SearchResultId } from "metabase-types/api";

import type { SearchItem, TypeWithModel } from "../../types";
import { ChunkyList, ResultItem } from "../ResultItem";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  folder: Item | undefined;
  searchResults: SearchItem[];
  selectedItem: Item | null;
  onItemSelect: (item: Item) => void;
}

export const SearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  folder,
  searchResults,
  selectedItem,
  onItemSelect,
}: Props<Id, Model, Item>) => {
  return (
    <Box h="100%">
      {searchResults.length > 0 ? (
        <Stack h="100%">
          <VirtualizedList
            Wrapper={({ children, ...props }) => (
              <Box p="xl" pt={folder ? 0 : "xl"} {...props}>
                <ChunkyList>{children}</ChunkyList>
              </Box>
            )}
          >
            {searchResults?.map((item, index) => (
              <ResultItem
                key={item.model + item.id}
                item={item}
                onClick={() => {
                  trackSearchClick("item", index, "entity-picker");
                  onItemSelect(item as unknown as Item);
                }}
                isSelected={
                  selectedItem?.id === item.id &&
                  selectedItem?.model === item.model
                }
                isLast={index === searchResults.length - 1}
              />
            ))}
          </VirtualizedList>
        </Stack>
      ) : (
        <Flex direction="column" justify="center" h="100%">
          <EmptyState
            title={t`Didn't find anything`}
            message={t`There weren't any results for your search.`}
            illustrationElement={<NoObjectError mb="-1.5rem" />}
          />
        </Flex>
      )}
    </Box>
  );
};
