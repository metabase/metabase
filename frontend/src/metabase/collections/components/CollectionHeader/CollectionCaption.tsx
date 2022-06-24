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
}

const CollectionCaption = ({
  collection,
  onChangeName,
}: CollectionCaptionProps): JSX.Element => {
  const handleChangeName = useCallback(
    (name: string) => {
      onChangeName(collection, name);
    },
    [collection, onChangeName],
  );

  return (
    <div>
      <CaptionContainer>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          size={24}
        />
        <CaptionTitle
          initialValue={collection.name}
          data-testid="collection-name-heading"
          onChange={handleChangeName}
        />
      </CaptionContainer>
      {collection.description && (
        <CaptionDescription>{collection.description}</CaptionDescription>
      )}
    </div>
  );
};

export default CollectionCaption;
