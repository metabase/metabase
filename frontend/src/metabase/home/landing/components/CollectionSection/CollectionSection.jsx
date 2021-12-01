import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import CollectionList from "metabase/components/CollectionList";
import Section, { SectionHeader, SectionTitle } from "../LandingSection";
import {
  CollectionLink,
  CollectionLinkIcon,
  CollectionLinkText,
  EmptyStateImage,
  EmptyStateRoot,
  EmptyStateTitle,
  CollectionContent,
} from "./CollectionSection.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  collections: PropTypes.array.isRequired,
};

const CollectionSection = ({ user, collections }) => {
  const showList = collections.some(c => c.id !== user.personal_collection_id);
  const collectionUrl = Urls.collection(ROOT_COLLECTION);

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{ROOT_COLLECTION.name}</SectionTitle>
      </SectionHeader>
      <CollectionContent>
        {showList ? (
          <CollectionList
            collections={collections}
            analyticsContext="Homepage"
          />
        ) : (
          <EmptyState user={user} />
        )}
        <CollectionLink to={collectionUrl}>
          <CollectionLinkText>{t`Browse all items`}</CollectionLinkText>
          <CollectionLinkIcon name="chevronright" />
        </CollectionLink>
      </CollectionContent>
    </Section>
  );
};

CollectionSection.propTypes = propTypes;

const emptyStatePropTypes = {
  user: PropTypes.object.isRequired,
};

const EmptyState = ({ user }) => {
  return (
    <EmptyStateRoot>
      <EmptyStateImage
        src="app/img/empty.png"
        srcSet="app/img/empty.png 1x, app/img/empty@2x.png 2x"
      />
      <EmptyStateTitle>
        {user.is_superuser
          ? t`Save dashboards, questions, and collections in "${ROOT_COLLECTION.name}"`
          : t`Access dashboards, questions, and collections in "${ROOT_COLLECTION.name}"`}
      </EmptyStateTitle>
    </EmptyStateRoot>
  );
};

EmptyState.propTypes = emptyStatePropTypes;

export default CollectionSection;
