import { t } from "ttag";

import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

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
  const tc = useTranslateContent();

  return (
    <BadgeList
      items={aggregationItems.map((item) => ({
        item,
        name: PLUGIN_CONTENT_TRANSLATION.translateAggregationDisplayName(
          item.displayName,
          tc,
        ),
      }))}
      addButtonLabel={t`Add another summary`}
      onSelectItem={onSelectItem}
      onAddItem={onAddItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
