import { Fragment } from "react";
import { t } from "ttag";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SelectList } from "metabase/common/components/SelectList";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { CardType, Collection, DatabaseId } from "metabase-types/api";

import SavedEntityListS from "./SavedEntityList.module.css";
import { CARD_INFO } from "./constants";

interface SavedEntityListProps {
  type: Extract<CardType, "model" | "question">;
  selectedId: string;
  databaseId: DatabaseId;
  collection?: Collection;
  onSelect: (tableOrModelId: string) => void;
}

const SavedEntityList = ({
  type,
  selectedId,
  databaseId,
  collection,
  onSelect,
}: SavedEntityListProps): JSX.Element => {
  const tc = useTranslateContent();
  const emptyState = (
    <Box m="7.5rem 0">
      <EmptyState message={t`Nothing here`} />
    </Box>
  );

  const isVirtualCollection = collection?.id === PERSONAL_COLLECTIONS.id;

  const { data, error, isFetching } = useListCollectionItemsQuery(
    collection && !isVirtualCollection
      ? {
          id: collection.id,
          models: [CARD_INFO[type].model],
          sort_column: "name",
          sort_direction: "asc",
        }
      : skipToken,
  );
  const list = data?.data ?? [];
  const filteredList = databaseId
    ? // When `databaseId` is provided, we're joining data, so we need to filter out items that don't belong to the current database
      list.filter((collectionItem) => collectionItem.database_id === databaseId)
    : list;

  return (
    <Box p="sm" w="100%">
      <SelectList className={SavedEntityListS.SavedEntityListRoot}>
        <LoadingAndErrorWrapper
          className={SavedEntityListS.LoadingWrapper}
          loading={!collection || isFetching}
          error={error}
        >
          <Fragment>
            {filteredList.map((collectionItem) => {
              const { id, name, moderated_status } = collectionItem;
              const virtualTableId = getQuestionVirtualTableId(id);

              return (
                <SelectList.Item
                  classNames={{
                    root: SavedEntityListS.SavedEntityListItem,
                    icon: SavedEntityListS.SavedEntityListItemIcon,
                  }}
                  key={id}
                  id={id}
                  isSelected={selectedId === virtualTableId}
                  size="small"
                  name={tc(name)}
                  icon={{
                    name: CARD_INFO[type].icon,
                    size: 16,
                  }}
                  onSelect={() => onSelect(virtualTableId)}
                  rightIcon={PLUGIN_MODERATION.getStatusIcon(
                    moderated_status ?? undefined,
                  )}
                />
              );
            })}
            {filteredList.length === 0 ? emptyState : null}
          </Fragment>
          {isVirtualCollection && emptyState}
        </LoadingAndErrorWrapper>
      </SelectList>
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SavedEntityList;
