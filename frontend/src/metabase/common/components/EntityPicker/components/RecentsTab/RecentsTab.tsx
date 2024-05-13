import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { NoObjectError } from "metabase/components/errors/NoObjectError";
import { SearchLoadingSpinner } from "metabase/nav/components/search/SearchResults";
import { Flex, Stack } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

import type { TypeWithModel } from "../../types";
import { isSelectedItem } from "../../utils";

import { GroupedRecentsList } from "./GroupedRecentsList";

export const RecentsTab = <
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  recentItems,
  onItemSelect,
  selectedItem,
  isLoading,
}: {
  recentItems: RecentItem[] | null;
  onItemSelect: (item: Item) => void;
  selectedItem: Item | null;
  isLoading: boolean;
}) => {
  if (isLoading || !recentItems) {
    return <SearchLoadingSpinner />;
  }

  return (
    <Stack h="100%" bg="bg-light">
      {recentItems.length > 0 ? (
        <GroupedRecentsList
          items={recentItems}
          onItemSelect={item => onItemSelect(item as unknown as Item)}
          isSelectedItem={item =>
            isSelectedItem(item as unknown as Item, selectedItem)
          }
        />
      ) : (
        <Flex direction="column" justify="center" h="100%">
          <EmptyState
            title={t`Didn't find anything`}
            message={t`There weren't any recent items.`}
            illustrationElement={<NoObjectError mb="-1.5rem" />}
          />
        </Flex>
      )}
    </Stack>
  );
};
