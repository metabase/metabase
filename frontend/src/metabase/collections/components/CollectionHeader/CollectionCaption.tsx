import { useCallback } from "react";
import { t } from "ttag";

import {
  isEditableCollection,
  isInstanceAnalyticsCollection,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { color } from "metabase/lib/colors";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { Icon } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import {
  CaptionDescription,
  CaptionRoot,
  CaptionTitle,
  CaptionTitleContainer,
} from "./CollectionCaption.styled";

export interface CollectionCaptionProps {
  collection: Collection;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

export const CollectionCaption = ({
  collection,
  onUpdateCollection,
}: CollectionCaptionProps): JSX.Element => {
  const isEditable = isEditableCollection(collection);
  const hasDescription = Boolean(collection.description);

  const handleChangeName = useCallback(
    (name: string) => {
      onUpdateCollection(collection, { name });
    },
    [collection, onUpdateCollection],
  );

  const handleChangeDescription = useCallback(
    (description: string) => {
      onUpdateCollection(collection, { description: description || null });
    },
    [collection, onUpdateCollection],
  );

  return (
    <CaptionRoot>
      <CaptionTitleContainer>
        <CollectionCaptionIcon collection={collection} />
        <CaptionTitle
          key={collection.id}
          initialValue={collection.name}
          placeholder={t`Add title`}
          isDisabled={!isEditable}
          data-testid="collection-name-heading"
          onChange={handleChangeName}
        />
      </CaptionTitleContainer>
      {(isEditable || hasDescription) && (
        <CaptionDescription
          key={
            // Including the description in the key prevents a stale value from
            // being stored in the state of EditableText if the collection's
            // description is modified in another component
            `${collection.id}-${collection.description}`
          }
          description={collection.description}
          placeholder={t`Add description`}
          isVisible={Boolean(collection.description)}
          canWrite={isEditable}
          onChange={handleChangeDescription}
          left={0}
        />
      )}
    </CaptionRoot>
  );
};

const CollectionCaptionIcon = ({ collection }: { collection: Collection }) => {
  if (isInstanceAnalyticsCollection(collection)) {
    return (
      <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
        size={24}
        color={color("brand")}
        collection={collection}
        entity="collection"
      />
    );
  }

  if (isRootTrashCollection(collection)) {
    return <Icon name="trash" size={24} />;
  }

  if (
    collection.archived &&
    PLUGIN_COLLECTIONS.isRegularCollection(collection)
  ) {
    return <Icon name="folder" size={24} color="text-light" />;
  }

  return (
    <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
      collection={collection}
      size={24}
      archived={collection.archived}
    />
  );
};
