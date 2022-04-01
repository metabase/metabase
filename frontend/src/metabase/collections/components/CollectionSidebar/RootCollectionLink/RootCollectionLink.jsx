import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";
import * as Urls from "metabase/lib/urls";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import CollectionsList from "metabase/collections/components/CollectionSidebar/Collections/CollectionsList";
import CollectionLink from "metabase/collections/components/CollectionSidebar/CollectionSidebarLink";

import { Container } from "./RootCollectionLink.styled";

const propTypes = {
  isRoot: PropTypes.bool.isRequired,
};

export default function RootCollectionLink({ isRoot }) {
  return (
    <Collection.Loader id={ROOT_COLLECTION.id}>
      {({ collection: root }) => (
        <Container>
          <CollectionDropTarget collection={root}>
            {({ highlighted, hovered }) => (
              <CollectionLink
                to={Urls.collection({ id: ROOT_COLLECTION.id })}
                selected={isRoot}
                highlighted={highlighted}
                hovered={hovered}
              >
                <CollectionsList.Icon collection={root} />
                {t`Our analytics`}
              </CollectionLink>
            )}
          </CollectionDropTarget>
        </Container>
      )}
    </Collection.Loader>
  );
}

RootCollectionLink.propTypes = propTypes;
