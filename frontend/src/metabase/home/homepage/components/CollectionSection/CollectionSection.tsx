import React from "react";
import { t } from "ttag";
import CollectionList from "metabase/components/CollectionList";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import * as Urls from "metabase/lib/urls";
import { Collection, User } from "../../types";
import Section, { SectionHeader, SectionTitle } from "../Section";
import {
  CollectionContent,
  CollectionLink,
  CollectionLinkIcon,
  CollectionLinkText,
  EmptyStateImage,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./CollectionSection.styled";

export interface CollectionSectionProps {
  user: User;
  collections: Collection[];
  onCollectionClick?: () => void;
}

const CollectionSection = ({
  user,
  collections,
  onCollectionClick,
}: CollectionSectionProps): JSX.Element => {
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
        <CollectionLink to={collectionUrl} onClick={onCollectionClick}>
          <CollectionLinkText>{t`Browse all items`}</CollectionLinkText>
          <CollectionLinkIcon name="chevronright" />
        </CollectionLink>
      </CollectionContent>
    </Section>
  );
};

interface EmptyStateProps {
  user: User;
}

const EmptyState = ({ user }: EmptyStateProps): JSX.Element => {
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

export default CollectionSection;
