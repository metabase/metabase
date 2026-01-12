import { useCallback } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import {
  isEditableCollection,
  isInstanceAnalyticsCollection,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { useSelector } from "metabase/lib/redux";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { getIsTenantUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import {
  CaptionDescription,
  CaptionRoot,
  CaptionTitle,
  CaptionTitleContainer,
} from "./CollectionCaption.styled";

interface CollectionCaptionProps {
  collection: Collection;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

export const CollectionCaption = ({
  collection,
  onUpdateCollection,
}: CollectionCaptionProps): JSX.Element => {
  const currentUser = useSelector(getCurrentUser);
  const isEditable = isEditableCollection(collection, { currentUser });
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
    <CaptionRoot data-testid="collection-caption">
      <CaptionTitleContainer>
        <CollectionCaptionIcon collection={collection} />
        <CaptionTitle
          key={collection.id}
          initialValue={collection.name}
          placeholder={t`Add title`}
          isDisabled={!isEditable}
          data-testid="collection-name-heading"
          onChange={handleChangeName}
          maxLength={100}
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
          data-testid="collection-description-in-caption"
          left={0}
          maxLength={255}
        />
      )}
    </CaptionRoot>
  );
};

const CollectionCaptionIcon = ({ collection }: { collection: Collection }) => {
  const isTenantUser = useSelector(getIsTenantUser);

  if (isInstanceAnalyticsCollection(collection)) {
    return (
      <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
        size={24}
        c="brand"
        collection={collection}
        entity="collection"
      />
    );
  }

  if (PLUGIN_COLLECTIONS.isSyncedCollection(collection) && !isTenantUser) {
    // external users should see the normal icon, they should not know about what synced collections are
    return <Icon name="synced_collection" size={24} c="brand" />;
  }

  if (isRootTrashCollection(collection)) {
    return <Icon name="trash" size={24} c="text-tertiary" />;
  }

  if (
    collection.archived &&
    PLUGIN_COLLECTIONS.isRegularCollection(collection)
  ) {
    return <Icon name="folder" size={24} c="text-tertiary" />;
  }

  return (
    <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
      collection={collection}
      size={24}
      archived={collection.archived}
    />
  );
};
