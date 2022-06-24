import React, { useCallback } from "react";
import { t } from "ttag";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import {
  isPersonalCollection,
  isRootCollection,
} from "metabase/collections/utils";
import { Collection } from "metabase-types/api";
import {
  CaptionDescription,
  CaptionRoot,
  CaptionTitle,
  CaptionTitleContainer,
} from "./CollectionCaption.styled";

export interface CollectionCaptionProps {
  collection: Collection;
  onChangeName: (collection: Collection, name: string) => void;
  onChangeDescription: (
    collection: Collection,
    description: string | null,
  ) => void;
}

const CollectionCaption = ({
  collection,
  onChangeName,
  onChangeDescription,
}: CollectionCaptionProps): JSX.Element => {
  const isRoot = isRootCollection(collection);
  const isPersonal = isPersonalCollection(collection);
  const isEditable = !isRoot && !isPersonal && collection.can_write;

  const handleChangeName = useCallback(
    (name: string) => {
      onChangeName(collection, name);
    },
    [collection, onChangeName],
  );

  const handleChangeDescription = useCallback(
    (description: string) => {
      onChangeDescription(collection, description ? description : null);
    },
    [collection, onChangeDescription],
  );

  return (
    <CaptionRoot>
      <CaptionTitleContainer>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          size={24}
        />
        <CaptionTitle
          key={collection.id}
          initialValue={collection.name}
          placeholder={t`Add title`}
          isDisabled={!isEditable}
          data-testid="collection-name-heading"
          onChange={handleChangeName}
        />
      </CaptionTitleContainer>
      {isEditable && (
        <CaptionDescription
          key={collection.id}
          initialValue={collection.description}
          placeholder={t`Add description`}
          isVisible={Boolean(collection.description)}
          isOptional
          isMultiline
          onChange={handleChangeDescription}
        />
      )}
    </CaptionRoot>
  );
};

export default CollectionCaption;
