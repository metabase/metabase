import { Fragment } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import Search from "metabase/entities/search";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { CardType, Collection, CollectionItem } from "metabase-types/api";

import {
  LoadingWrapper,
  SavedEntityListEmptyState,
  SavedEntityListItem,
  SavedEntityListRoot,
} from "./SavedEntityList.styled";
import { CARD_INFO } from "./constants";

interface SavedEntityListProps {
  type: CardType;
  selectedId: string;
  collection?: Collection;
  onSelect: (tableOrModelId: string) => void;
}

const SavedEntityList = ({
  type,
  selectedId,
  collection,
  onSelect,
}: SavedEntityListProps): JSX.Element => {
  const emptyState = (
    <SavedEntityListEmptyState>
      <EmptyState message={t`Nothing here`} />
    </SavedEntityListEmptyState>
  );

  const isVirtualCollection = collection?.id === PERSONAL_COLLECTIONS.id;

  return (
    <SavedEntityListRoot>
      <LoadingWrapper loading={!collection}>
        {collection && !isVirtualCollection && (
          <Search.ListLoader
            query={{
              collection: collection.id,
              models: [CARD_INFO[type].model],
              sort_column: "name",
              sort_direction: "asc",
            }}
          >
            {({ list }: { list: CollectionItem[] }) => {
              return (
                <Fragment>
                  {list.map(collectionItem => {
                    const { id, name, moderated_status } = collectionItem;
                    const virtualTableId = getQuestionVirtualTableId(id);

                    return (
                      <SavedEntityListItem
                        key={id}
                        id={id}
                        isSelected={selectedId === virtualTableId}
                        size="small"
                        name={name}
                        icon={{
                          name: CARD_INFO[type].icon,
                          size: 16,
                        }}
                        onSelect={() => onSelect(virtualTableId)}
                        rightIcon={PLUGIN_MODERATION.getStatusIcon(
                          moderated_status,
                        )}
                      />
                    );
                  })}
                  {list.length === 0 ? emptyState : null}
                </Fragment>
              );
            }}
          </Search.ListLoader>
        )}
        {isVirtualCollection && emptyState}
      </LoadingWrapper>
    </SavedEntityListRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SavedEntityList;
