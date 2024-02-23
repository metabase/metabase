import { useCallback } from "react";
import { t } from "ttag";

import {
  isRootPersonalCollection,
  isRootCollection,
} from "metabase/collections/utils";
import { color } from "metabase/lib/colors";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
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
  const isRoot = isRootCollection(collection);
  const isPersonal = isRootPersonalCollection(collection);
  const isEditable = !isRoot && !isPersonal && collection.can_write;
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
          key={collection.id}
          initialValue={collection.description}
          placeholder={t`Add description`}
          isVisible={Boolean(collection.description)}
          isDisabled={!isEditable}
          isOptional
          isMultiline
          isMarkdown
          onChange={handleChangeDescription}
        />
      )}
    </CaptionRoot>
  );
};

const CollectionCaptionIcon = ({ collection }: { collection: Collection }) => {
  if (!collection.type) {
    return (
      <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
        collection={collection}
        size={24}
      />
    );
  } else {
    return (
      <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
        size={24}
        color={color("brand")}
        collection={collection}
        entity="collection"
      />
    );
  }
};
