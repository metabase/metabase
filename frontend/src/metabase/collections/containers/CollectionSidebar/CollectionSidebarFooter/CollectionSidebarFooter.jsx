import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import CollectionsList from "../Collections/CollectionsList/CollectionsList";
import { Container, Icon, Link } from "./CollectionSidebarFooter.styled";

const propTypes = {
  isAdmin: PropTypes.bool.isRequired,
  isAnotherUserCollectionOpened: PropTypes.bool,
  collectionId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  collections: PropTypes.arrayOf(PropTypes.object),
  onClose: PropTypes.func,
  onOpen: PropTypes.func,
  otherCollections: PropTypes.arrayOf(PropTypes.object),
};

export default function CollectionSidebarFooter({ isAdmin }) {
  return (
    <Container>
      {isAdmin && isAnotherUserCollectionOpened && (
        <CollectionsList
        openCollections={openCollections}
        onClose={onClose}
        onOpen={onOpen}
        collections={otherCollections}
        initialIcon="group"
        currentCollection={collectionId}
        />
      )}

      {isAdmin && (
        <Link to={Urls.collection({ id: "users" })}>
          <CollectionsList.Icon collection={PERSONAL_COLLECTIONS} />
          {t`Other users' personal collections`}
        </Link>
      )}

      <Link to={`/archive`}>
        <Icon name="view_archive" />
        {t`View archive`}
      </Link>
    </Container>
  );
}

CollectionSidebarFooter.propTypes = propTypes;
