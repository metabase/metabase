import { Fragment } from "react";
import { t } from "ttag";

import { Badge } from "metabase/components/Badge";
import { useToggle } from "metabase/hooks/use-toggle";
import * as Urls from "metabase/lib/urls";
import { CollectionBadge } from "metabase/questions/components/CollectionBadge";
import type Question from "metabase-lib/v1/Question";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
  Dashboard,
} from "metabase-types/api";

import {
  BreadcrumbsPathSeparator,
  ExpandButton,
  PathContainer,
} from "./CollectionBreadcrumbs.styled";
import { getCollectionList } from "./utils";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
  dashboard?: Dashboard;
  originalDashboard?: Dashboard;
  onClick?: (collection: CollectionEssentials) => void;
  baseCollectionId: CollectionId | null;
  isModifiedQuestion?: boolean;
  originalQuestion?: Question | null;
}

export const CollectionBreadcrumbs = ({
  collection,
  dashboard,
  originalDashboard,
  onClick,
  baseCollectionId = null,
  isModifiedQuestion = false,
  originalQuestion,
}: CollectionBreadcrumbsProps): JSX.Element | null => {
  const [isExpanded, { toggle }] = useToggle(false);

  if (!collection) {
    return null;
  }

  const parts = getCollectionList({
    baseCollectionId,
    collection,
  });

  const separator = <BreadcrumbsPathSeparator>/</BreadcrumbsPathSeparator>;

  const content =
    parts.length > 1 && !isExpanded ? (
      <>
        <CollectionBadge
          collectionId={parts[0].id}
          isSingleLine
          onClick={onClick ? () => onClick(collection) : undefined}
        />
        {separator}
        <ExpandButton
          small
          borderless
          icon="ellipsis"
          onlyIcon
          onClick={toggle}
        />
        {separator}
      </>
    ) : (
      parts.map((collection) => (
        <Fragment key={collection.id}>
          <CollectionBadge
            collectionId={collection.id}
            isSingleLine
            onClick={onClick ? () => onClick(collection) : undefined}
          />
          {separator}
        </Fragment>
      ))
    );

  return (
    <>
      <PathContainer>
        {content}
        <CollectionBadge
          collectionId={collection.id}
          isSingleLine
          onClick={onClick ? () => onClick(collection) : undefined}
        />
        {isModifiedQuestion && originalQuestion && (
          <>
            {originalDashboard && (
              <>
                {separator}
                <Badge
                  icon={{ name: "dashboard" }}
                  inactiveColor="text-light"
                  isSingleLine
                  to={Urls.dashboard(originalDashboard)}
                >
                  {originalDashboard.name}
                </Badge>
              </>
            )}
            {separator}
            <Badge isSingleLine to={Urls.question(originalQuestion.card())}>
              {originalQuestion.displayName()}
            </Badge>
            {separator}
            <Badge isSingleLine>{t`New exploration`}</Badge>
          </>
        )}
      </PathContainer>
      {dashboard && (
        <>
          {separator}
          <Badge
            icon={{ name: "dashboard" }}
            inactiveColor="text-light"
            isSingleLine
            to={Urls.dashboard(dashboard)}
          >
            {dashboard.name}
          </Badge>
        </>
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
