import React from "react";
import PropTypes from "prop-types";
import CollectionsList from "./CollectionsList/CollectionsList";
import { Box } from "grid-styled";

import {
  nonPersonalOrArchivedCollection,
  currentUserPersonalCollections as getCurrentUserPersonalCollections,
} from "metabase/collections/utils";

import { Container } from "./Collections.styled";

const propTypes = {
  collectionId: PropTypes.number,
  currentUserId: PropTypes.number,
  list: PropTypes.array,
  onClose: PropTypes.func.isRequired,
  onOpen: PropTypes.func.isRequired,
  openCollections: PropTypes.array,
};

export default function Collections({
  collectionId,
  currentUserId,
  list,
  onClose,
  onOpen,
  openCollections,
}) {
  function filterPersonalCollections(collection) {
    return !collection.archived;
  }

  const currentUserPersonalCollections = getCurrentUserPersonalCollections(
    list,
    currentUserId,
  );

  return (
    <Container>
      <CollectionsList
        openCollections={openCollections}
        onClose={onClose}
        onOpen={onOpen}
        collections={list}
        filter={nonPersonalOrArchivedCollection}
        currentCollection={collectionId}
      />

      <Box>
        <CollectionsList
          openCollections={openCollections}
          onClose={onClose}
          onOpen={onOpen}
          collections={currentUserPersonalCollections}
          initialIcon="person"
          filter={filterPersonalCollections}
          currentCollection={collectionId}
        />
      </Box>
    </Container>
  );
}

Collections.propTypes = propTypes;
