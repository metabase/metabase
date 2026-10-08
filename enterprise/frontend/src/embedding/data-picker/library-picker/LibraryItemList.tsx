import { t } from "ttag";

import { useListCollectionItemsQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SelectList } from "metabase/common/components/SelectList";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { Box } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  CollectionId,
  CollectionItem,
  DatabaseId,
  IconName,
  TableId,
} from "metabase-types/api";

import SavedEntityListS from "../saved-entity-picker/SavedEntityList.module.css";

interface LibraryItemListProps {
  collectionId: CollectionId;
  canSelectTable: boolean;
  canSelectModel: boolean;
  canSelectMetric: boolean;
  databaseId?: DatabaseId | null;
  selectedTableId?: TableId;
  onSelect: (tableId: TableId) => void;
}

export function LibraryItemList({
  collectionId,
  canSelectTable,
  canSelectModel,
  canSelectMetric,
  databaseId,
  selectedTableId,
  onSelect,
}: LibraryItemListProps) {
  const translateContent = useTranslateContent();
  const { data, error, isFetching } = useListCollectionItemsQuery({
    id: collectionId,
    models: [
      ...(canSelectTable ? ["table" as const] : []),
      ...(canSelectModel ? ["dataset" as const] : []),
      ...(canSelectMetric ? ["metric" as const] : []),
    ],
    "sort-column": "name",
    "sort-direction": "asc",
  });
  const list = data?.data ?? [];
  // When `databaseId` is provided, we're joining data, so we need to filter out items that don't belong to the current database
  const items = databaseId
    ? list.filter((item) => item.database_id === databaseId)
    : list;

  return (
    <Box p="sm" w="100%">
      <SelectList className={SavedEntityListS.SavedEntityListRoot}>
        <LoadingAndErrorWrapper
          className={SavedEntityListS.LoadingWrapper}
          loading={isFetching}
          error={error}
        >
          {items.map((item) => {
            const tableId =
              item.model === "table"
                ? item.id
                : getQuestionVirtualTableId(item.id);

            return (
              <SelectList.Item
                classNames={{
                  root: SavedEntityListS.SavedEntityListItem,
                  icon: SavedEntityListS.SavedEntityListItemIcon,
                }}
                key={`${item.model}-${item.id}`}
                id={item.id}
                isSelected={selectedTableId === tableId}
                size="small"
                name={translateContent(item.name)}
                icon={{ name: getItemIcon(item.model), size: 16 }}
                onSelect={() => onSelect(tableId)}
              />
            );
          })}
          {items.length === 0 ? (
            <Box m="7.5rem 0">
              <EmptyState message={t`Nothing here`} />
            </Box>
          ) : null}
        </LoadingAndErrorWrapper>
      </SelectList>
    </Box>
  );
}

function getItemIcon(model: CollectionItem["model"]): IconName {
  switch (model) {
    case "table":
      return "table";
    case "metric":
      return "metric";
    default:
      return "model";
  }
}
