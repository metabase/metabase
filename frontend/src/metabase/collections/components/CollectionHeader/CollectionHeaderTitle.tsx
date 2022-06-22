import React from "react";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { Collection } from "metabase-types/api";
import {
  HeaderCaption,
  HeaderTitle,
  HeaderDescription,
} from "./CollectionHeaderTitle.styled";

export interface CollectionHeaderTitleProps {
  collection: Collection;
}

const CollectionHeaderTitle = ({
  collection,
}: CollectionHeaderTitleProps): JSX.Element => {
  return (
    <div>
      <HeaderCaption>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          size={24}
        />
        <HeaderTitle data-testid="collection-name-heading">
          {collection.name}
        </HeaderTitle>
      </HeaderCaption>
      {collection.description && (
        <HeaderDescription>{collection.description}</HeaderDescription>
      )}
    </div>
  );
};

export default CollectionHeaderTitle;
