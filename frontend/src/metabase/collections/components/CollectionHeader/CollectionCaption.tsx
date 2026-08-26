import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import {
  isEditableCollection,
  isInstanceAnalyticsCollection,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import { EditableDescription } from "metabase/common/components/EditableDescription";
import { EditableText } from "metabase/common/components/EditableText";
import { getIsTenantUser, getUser } from "metabase/current-user";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Box, Flex, Icon, rem } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import S from "./CollectionCaption.module.css";

interface CollectionCaptionProps {
  collection: Collection;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
}

export const CollectionCaption = ({
  collection,
  onUpdateCollection,
}: CollectionCaptionProps): JSX.Element => {
  const currentUser = useSelector(getUser);
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
    <Box className={S.root} data-testid="collection-caption">
      <Flex align="center" gap="sm">
        <CollectionCaptionIcon collection={collection} />
        <EditableText
          key={collection.id}
          initialValue={collection.name}
          placeholder={t`Add title`}
          isDisabled={!isEditable}
          data-testid="collection-name-heading"
          onChange={handleChangeName}
          maxLength={100}
          fz={rem(28)}
          fw={900}
        />
      </Flex>
      {(isEditable || hasDescription) && (
        <EditableDescription
          key={
            // Including the description in the key prevents a stale value from
            // being stored in the state of EditableText if the collection's
            // description is modified in another component
            `${collection.id}-${collection.description}`
          }
          className={cx(S.description, {
            [S.visible]: Boolean(collection.description),
          })}
          description={collection.description}
          placeholder={t`Add description`}
          canWrite={isEditable}
          onChange={handleChangeDescription}
          data-testid="collection-description-in-caption"
          left={0}
          maw={rem(400)}
          maxLength={255}
        />
      )}
    </Box>
  );
};

const CollectionCaptionIcon = ({ collection }: { collection: Collection }) => {
  const isTenantUser = useSelector(getIsTenantUser);

  if (isInstanceAnalyticsCollection(collection)) {
    return (
      <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
        size={24}
        c="core-brand"
        collection={collection}
        entity="collection"
      />
    );
  }

  if (PLUGIN_COLLECTIONS.isSyncedCollection(collection) && !isTenantUser) {
    // external users should see the normal icon, they should not know about what synced collections are
    return <Icon name="synced_collection" size={24} c="core-brand" />;
  }

  if (isRootTrashCollection(collection)) {
    return <Icon name="trash" size={24} c="text-disabled" />;
  }

  if (
    collection.archived &&
    PLUGIN_COLLECTIONS.isRegularCollection(collection)
  ) {
    return <Icon name="folder" size={24} c="text-disabled" />;
  }

  return (
    <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
      collection={collection}
      size={24}
      archived={collection.archived}
    />
  );
};
