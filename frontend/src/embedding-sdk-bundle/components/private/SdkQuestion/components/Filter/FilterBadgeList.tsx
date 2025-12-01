import { t } from "ttag";

import {
  type SDKFilterItem,
  useFilterData,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components/Filter/hooks/use-filter-data";
import { BadgeList } from "embedding-sdk-bundle/components/private/SdkQuestion/components/util/BadgeList";

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

  return (
    <BadgeList
      addButtonLabel={t`Add another filter`}
      items={filterItems.map((item) => ({ item, name: item.displayName }))}
      onAddItem={onAddItem}
      onSelectItem={onSelectItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
