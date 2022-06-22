import React from "react";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Collection } from "metabase-types/api";
import {
  CollectionTitleContainer,
  CollectionTitle,
  CollectionDescription,
} from "./CollectionCaption.styled";

export interface CollectionCaptionProps {
  collection: Collection;
}

const CollectionCaption = ({
  collection,
}: CollectionCaptionProps): JSX.Element => {
  return (
    <div>
      <CollectionTitleContainer>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          size={24}
        />
        <CollectionTitle data-testid="collection-name-heading">
          {collection.name}
        </CollectionTitle>
      </CollectionTitleContainer>
      {collection.description && (
        <CollectionDescription>{collection.description}</CollectionDescription>
      )}
    </div>
  );
};

export default CollectionCaption;
