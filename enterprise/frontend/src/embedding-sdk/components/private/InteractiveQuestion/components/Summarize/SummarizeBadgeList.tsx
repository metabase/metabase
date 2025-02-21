import { t } from "ttag";

import { BadgeList, type BadgeListProps } from "../util/BadgeList";

import {
  type SDKAggregationItem,
  useSummarizeData,
} from "./use-summarize-data";

export const SummarizeBadgeList = ({
  onSelectItem,
  onAddItem,
  onRemoveItem,
}: Pick<
  BadgeListProps<SDKAggregationItem>,
  "onRemoveItem" | "onAddItem" | "onSelectItem"
>) => {
  const aggregationItems = useSummarizeData();

  return (
    <BadgeList
      items={aggregationItems.map(item => ({ item, name: item.displayName }))}
      addButtonLabel={t`Add another summary`}
      onSelectItem={onSelectItem}
      onAddItem={onAddItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
