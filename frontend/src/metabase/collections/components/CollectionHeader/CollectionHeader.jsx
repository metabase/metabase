/* eslint-disable react/prop-types */
import React from "react";
import PageHeading from "metabase/components/type/PageHeading";

import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";

import {
  Container,
  DescriptionHeading,
  TitleContent,
} from "./CollectionHeader.styled";
import CollectionActions from "../CollectionActions";

function Title({ collection }) {
  return (
    <div>
      <TitleContent>
        <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
          collection={collection}
          mr={1}
          size={24}
        />
        <PageHeading
          data-testid="collection-name-heading"
          className="text-wrap"
        >
          {collection.name}
        </PageHeading>
      </TitleContent>
      {collection.description && (
        <DescriptionHeading>{collection.description}</DescriptionHeading>
      )}
    </div>
  );
}

export default function CollectionHeader(props) {
  return (
    <Container>
      <Title {...props} />
      <CollectionActions {...props} />
    </Container>
  );
}
