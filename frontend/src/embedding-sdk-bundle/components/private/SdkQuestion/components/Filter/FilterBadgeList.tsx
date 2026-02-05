import { t } from "ttag";

import {
  type SDKFilterItem,
  useFilterData,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components/Filter/hooks/use-filter-data";
import { BadgeList } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/BadgeList";
import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

export const FilterBadgeList = ({
  onAddItem,
  onSelectItem,
  onRemoveItem,
}: {
  onSelectItem?: (item: SDKFilterItem, index: number) => void;
  onAddItem?: () => void;
  onRemoveItem?: (item: SDKFilterItem) => void;
}) => {
  const filterItems = useFilterData();
  const tc = useTranslateContent();

  return (
    <BadgeList
      addButtonLabel={t`Add another filter`}
      items={filterItems.map((item) => ({
        item,
        name: PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName(
          item.displayName,
          tc,
        ),
      }))}
      onAddItem={onAddItem}
      onSelectItem={onSelectItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
