import type { PropsWithChildren } from "react";
import { t } from "ttag";

import EmptyStateIcon from "assets/img/empty-states/collection.svg";
import {
  isLibraryCollection,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { NewItemMenu } from "metabase/common/components/NewItemMenu";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Box, Button, Icon, Stack, Text, useMantineTheme } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { trackCollectionNewButtonClicked } from "./analytics";

export interface CollectionEmptyStateProps {
  collection?: Collection;
}

const CollectionEmptyState = ({
  collection,
}: CollectionEmptyStateProps): JSX.Element => {
  const isTrashCollection = !!collection && isRootTrashCollection(collection);
  const isArchived = !!collection?.archived;

  if (isTrashCollection) {
    return <TrashEmptyState />;
  } else if (isArchived) {
    return <ArchivedCollectionEmptyState />;
  } else {
    return <DefaultCollectionEmptyState collection={collection} />;
  }
};

const TrashEmptyState = () => {
  return (
    <EmptyStateWrapper>
      <Icon name="trash" size={80} c="background-brand" />
      <EmptyStateTitle>{t`Nothing here`}</EmptyStateTitle>
      <EmptyStateSubtitle>
        {t`Deleted items will appear here.`}
      </EmptyStateSubtitle>
    </EmptyStateWrapper>
  );
};

const ArchivedCollectionEmptyState = () => {
  return (
    <EmptyStateWrapper>
      <CollectionEmptyIcon />
      <EmptyStateTitle>{t`This collection is empty`}</EmptyStateTitle>
    </EmptyStateWrapper>
  );
};

const DefaultCollectionEmptyState = ({
  collection,
}: CollectionEmptyStateProps) => {
  const { title, description } = getDefaultEmptyStateMessages(collection);
  const canWrite = !!collection?.can_write;
  const isSemanticLayer = collection != null && isLibraryCollection(collection);
  const showAddButton = canWrite && !isSemanticLayer;

  return (
    <EmptyStateWrapper>
      <CollectionEmptyIcon />
      <EmptyStateTitle>{title}</EmptyStateTitle>
      <EmptyStateSubtitle>{description}</EmptyStateSubtitle>
      {showAddButton && (
        <NewItemMenu
          trigger={
            <Button
              variant="outline"
              leftSection={<Icon name="add" />}
              w="12.5rem"
              onClick={() => trackCollectionNewButtonClicked()}
            >{t`New`}</Button>
          }
          collectionId={collection?.id}
        />
      )}
    </EmptyStateWrapper>
  );
};

function getDefaultEmptyStateMessages(collection: Collection | undefined) {
  switch (PLUGIN_DATA_STUDIO.getLibraryCollectionType(collection?.type)) {
    case "data":
      return {
        title: t`No published tables yet`,
        description: t`Publish tables in the Library to see them here.`,
      };
    case "metrics":
      return {
        title: t`No metrics yet`,
        description: t`Put metrics in the Library to see them here.`,
      };
    default:
      return {
        title: t`This collection is empty`,
        description: t`Use collections to organize questions, dashboards, models, and other collections.`,
      };
  }
}

export const CollectionEmptyIcon = (): JSX.Element => {
  return (
    <Box w="6rem">
      <img src={EmptyStateIcon} alt={t`Empty collection illustration.`} />
    </Box>
  );
};

export const EmptyStateTitle = ({ children }: PropsWithChildren) => {
  const theme = useMantineTheme();
  return (
    <Box
      c="text-primary"
      fz={theme.other.collectionBrowser.emptyContent.title.fontSize}
      fw="bold"
      lh="2rem"
      mt="2.5rem"
      mb="0.75rem"
    >
      {children}
    </Box>
  );
};

export const EmptyStateSubtitle = ({ children }: PropsWithChildren) => {
  const theme = useMantineTheme();
  return (
    <Text
      fz={theme.other.collectionBrowser.emptyContent.subtitle.fontSize}
      c="text-secondary"
      ta="center"
      mb="1.5rem"
      maw="25rem"
    >
      {children}
    </Text>
  );
};

export const EmptyStateWrapper = ({
  children,
  ...props
}: PropsWithChildren<{ "data-testid"?: string }>) => {
  return (
    <Stack
      data-testid={props["data-testid"] || "collection-empty-state"}
      align="center"
      gap={0}
    >
      {children}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionEmptyState;
