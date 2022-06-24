import React, { useCallback } from "react";
import { t } from "ttag";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Collection } from "metabase-types/api";
import {
  CaptionTitleContainer,
  CaptionTitle,
  CaptionDescription,
  CaptionRoot,
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
          data-testid="collection-name-heading"
          onChange={handleChangeName}
        />
      </CaptionTitleContainer>
      <CaptionDescription
        key={collection.id}
        initialValue={collection.description}
        placeholder={t`Add description`}
        isVisible={Boolean(collection.description)}
        isOptional
        isMultiline
        onChange={handleChangeDescription}
      />
    </CaptionRoot>
  );
};

export default CollectionCaption;
