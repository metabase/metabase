import React, { useCallback } from "react";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Collection } from "metabase-types/api";
import {
  CaptionContainer,
  CaptionTitle,
  CaptionDescription,
} from "./CollectionCaption.styled";

export interface CollectionCaptionProps {
  collection: Collection;
  onChangeName: (collection: Collection, name: string) => void;
  onChangeDescription: (collection: Collection, description: string) => void;
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
      onChangeDescription(collection, description);
    },
    [collection, onChangeDescription],
  );

  return (
    <div>
      <CaptionContainer>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          size={24}
        />
        <CaptionTitle
          key={collection.id}
          initialValue={collection.name}
          data-testid="collection-name-heading"
          onChange={handleChangeName}
        />
      </CaptionContainer>
      {collection.description && (
        <CaptionDescription
          key={collection.id}
          initialValue={collection.description}
          isOptional
          isMultiline
          onChange={handleChangeDescription}
        />
      )}
    </div>
  );
};

export default CollectionCaption;
