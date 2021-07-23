import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import CollectionLink from "metabase/collections/components/CollectionLink";

import { Container } from "./CollectionSidebarHeader.styled";

const propTypes = {
  isRoot: PropTypes.bool.isRequired,
  root: PropTypes.object.isRequired,
};

export default function CollectionSidebarHeader({ isRoot, root }) {
  return (
    <Container>
      <CollectionDropTarget collection={root}>
        {({ highlighted, hovered }) => (
          <CollectionLink
            to={Urls.collection({ id: "root" })}
            selected={isRoot}
            highlighted={highlighted}
            hovered={hovered}
          >
            {t`Our analytics`}
          </CollectionLink>
        )}
      </CollectionDropTarget>
    </Container>
  );
}

CollectionSidebarHeader.propTypes = propTypes;
