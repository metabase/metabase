import React from "react";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Collection } from "metabase-types/api";
import {
  CaptionContainer,
  CaptionTitle,
  CaptionDescription,
} from "./CollectionCaption.styled";

export interface CollectionCaptionProps {
  collection: Collection;
}

const CollectionCaption = ({
  collection,
}: CollectionCaptionProps): JSX.Element => {
  return (
    <div>
      <CaptionContainer>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          size={24}
        />
        <CaptionTitle data-testid="collection-name-heading">
          {collection.name}
        </CaptionTitle>
      </CaptionContainer>
      {collection.description && (
        <CaptionDescription>{collection.description}</CaptionDescription>
      )}
    </div>
  );
};

export default CollectionCaption;
