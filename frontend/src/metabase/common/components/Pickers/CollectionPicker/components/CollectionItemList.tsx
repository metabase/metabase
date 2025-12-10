import { useListCollectionItemsQuery } from "metabase/api";
import { useOmniPickerContext } from "metabase/common/components/EntityPicker/context";
import type { CollectionItemModel } from "metabase-types/api";

import { ItemList, type OmniPickerItem } from "../../../EntityPicker";

const validCollectionModels = new Set([
  "collection",
  "dashboard",
  "document",
  "card",
  "dataset",
  "metric",
  "table",
]);

const isValidModel = (model: OmniPickerItem['model']): model is CollectionItemModel =>
  validCollectionModels.has(model);

const getValidCollectionItemModels = (models: OmniPickerItem['model'][]): CollectionItemModel[] =>
  models.filter(isValidModel);

export const CollectionItemList = ({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerItem;
  pathIndex: number;
}) => {
  const { models } = useOmniPickerContext();

  const {
    data: items,
    error,
    isLoading,
  } = useListCollectionItemsQuery({
    id: parentItem.id,
    models: getValidCollectionItemModels(models),
    include_can_run_adhoc_query: true,
  });

  return (
    <ItemList
      items={collectionItems?.data}
      pathIndex={pathIndex}
      isLoading={isLoading}
      error={error}
    />
  );
};
