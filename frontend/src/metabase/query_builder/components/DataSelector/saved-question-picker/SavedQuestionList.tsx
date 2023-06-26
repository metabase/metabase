import { Fragment } from "react";
import { t } from "ttag";
import { PLUGIN_MODERATION } from "metabase/plugins";
import Search from "metabase/entities/search";
import EmptyState from "metabase/components/EmptyState";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { Collection, CollectionItem } from "metabase-types/api";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";

import {
  LoadingWrapper,
  SavedQuestionListEmptyState,
  SavedQuestionListItem,
  SavedQuestionListRoot,
} from "./SavedQuestionList.styled";

interface SavedQuestionListProps {
  isDatasets: boolean;
  selectedId: string;
  collection?: Collection;
  onSelect: (tableOrModelId: string) => void;
}

const SavedQuestionList = ({
  isDatasets,
  selectedId,
  collection,
  onSelect,
}: SavedQuestionListProps): JSX.Element => {
  const emptyState = (
    <SavedQuestionListEmptyState>
      <EmptyState message={t`Nothing here`} icon="all" />
    </SavedQuestionListEmptyState>
  );

  const isVirtualCollection = collection?.id === PERSONAL_COLLECTIONS.id;

  return (
    <SavedQuestionListRoot>
      <LoadingWrapper loading={!collection}>
        {collection && !isVirtualCollection && (
          <Search.ListLoader
            query={{
              collection: collection.id,
              models: [isDatasets ? "dataset" : "card"],
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
                      <SavedQuestionListItem
                        key={id}
                        id={id}
                        isSelected={selectedId === virtualTableId}
                        size="small"
                        name={name}
                        icon={{
                          name: isDatasets ? "model" : "table2",
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
    </SavedQuestionListRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SavedQuestionList;
