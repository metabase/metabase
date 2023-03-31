import React from "react";
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
  onSelect: (collectionOrModel: { id: string }) => void;
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
                <React.Fragment>
                  {list.map(t => {
                    const virtualTableId = getQuestionVirtualTableId(t.id);

                    return (
                      <SavedQuestionListItem
                        id={t.id}
                        isSelected={selectedId === virtualTableId}
                        key={t.id}
                        size="small"
                        name={t.name}
                        icon={{
                          name: isDatasets ? "model" : "table2",
                          size: 16,
                        }}
                        onSelect={() => onSelect({ id: virtualTableId })}
                        rightIcon={PLUGIN_MODERATION.getStatusIcon(
                          t.moderated_status,
                        )}
                      />
                    );
                  })}
                  {list.length === 0 ? emptyState : null}
                </React.Fragment>
              );
            }}
          </Search.ListLoader>
        )}
        {isVirtualCollection && emptyState}
      </LoadingWrapper>
    </SavedQuestionListRoot>
  );
};

export default SavedQuestionList;
