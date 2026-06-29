import { Fragment } from "react";
import { t } from "ttag";

import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import { useToggle } from "metabase/common/hooks/use-toggle";
import { useTranslateContent } from "metabase/i18n/hooks";
import { CollectionBadge } from "metabase/questions/components/CollectionBadge";
import { ActionIcon, Box, Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
  Dashboard,
} from "metabase-types/api";

import { getCollectionList } from "./utils";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
  dashboard?: Dashboard;
  onClick?: (collection: CollectionEssentials) => void;
  baseCollectionId: CollectionId | null;
}

export const CollectionBreadcrumbs = ({
  collection,
  dashboard,
  onClick,
  baseCollectionId = null,
}: CollectionBreadcrumbsProps): JSX.Element | null => {
  const [isExpanded, { toggle }] = useToggle(false);
  const tc = useTranslateContent();

  if (!collection) {
    return null;
  }

  const parts = getCollectionList({
    baseCollectionId,
    collection,
  });

  const separator = (
    <Box
      c="text-disabled"
      fz="0.8em"
      fw="bold"
      mx="0.5rem"
      style={{ userSelect: "none" }}
    >
      /
    </Box>
  );

  const content =
    parts.length > 1 && !isExpanded ? (
      <>
        <CollectionBadge
          collectionId={parts[0].id}
          onClick={onClick ? () => onClick(collection) : undefined}
        />
        {separator}
        <ActionIcon
          onClick={toggle}
          aria-label={isExpanded ? t`Collapse` : t`Expand`}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
        {separator}
      </>
    ) : (
      parts.map((collection) => (
        <Fragment key={collection.id}>
          <CollectionBadge
            collectionId={collection.id}
            onClick={onClick ? () => onClick(collection) : undefined}
          />
          {separator}
        </Fragment>
      ))
    );

  return (
    <Flex align="center" miw="0">
      {content}
      <CollectionBadge
        collectionId={collection.id}
        onClick={onClick ? () => onClick(collection) : undefined}
      />
      {dashboard && (
        <>
          {separator}

          <Breadcrumb icon="dashboard" to={Urls.dashboard(dashboard)}>
            {tc(dashboard.name)}
          </Breadcrumb>
        </>
      )}
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
