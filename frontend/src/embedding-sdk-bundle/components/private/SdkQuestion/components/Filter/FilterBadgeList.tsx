import { t } from "ttag";

import {
  type SDKFilterItem,
  useFilterData,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components/Filter/hooks/use-filter-data";
import { BadgeList } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/BadgeList";
import { useTranslateContent } from "metabase/i18n/hooks";

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
      items={filterItems.map((item) => ({ item, name: tc(item.displayName) }))}
      onAddItem={onAddItem}
      onSelectItem={onSelectItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
