import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import CollectionLink from "../CollectionLink/CollectionLink";

import { Container } from "./RootCollectionLink.styled";

const propTypes = {
  handleToggleMobileSidebar: PropTypes.func.isRequired,
  isRoot: PropTypes.bool.isRequired,
  root: PropTypes.object.isRequired,
};

export default function RootCollectionLink({
  handleToggleMobileSidebar,
  isRoot,
  root,
}) {
  function handleClick() {
    handleToggleMobileSidebar();
  }

  return (
    <Container>
      <CollectionDropTarget collection={root}>
        {({ highlighted, hovered }) => (
          <CollectionLink
            to={Urls.collection({ id: "root" })}
            onClick={handleClick}
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

RootCollectionLink.propTypes = propTypes;
