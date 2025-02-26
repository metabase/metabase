import type { PropsWithChildren } from "react";
import { t } from "ttag";

import EmptyStateIcon from "assets/img/empty-states/collection.svg";
import { isRootTrashCollection } from "metabase/collections/utils";
import NewItemMenu from "metabase/containers/NewItemMenu";
import { color } from "metabase/lib/colors";
import { Box, Button, Icon, Stack, Text, useMantineTheme } from "metabase/ui";
import type { Collection } from "metabase-types/api";

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
      <Icon name="trash" size={80} color={color("brand-light")} />
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
  const canWrite = !!collection?.can_write;

  return (
    <EmptyStateWrapper>
      <CollectionEmptyIcon />
      <EmptyStateTitle>{t`This collection is empty`}</EmptyStateTitle>
      <EmptyStateSubtitle>
        {t`Use collections to organize questions, dashboards, models, and other collections.`}
      </EmptyStateSubtitle>
      {canWrite && (
        <NewItemMenu
          trigger={
            <Button
              variant="outline"
              leftSection={<Icon name="add" />}
              w="12.5rem"
            >{t`New`}</Button>
          }
          collectionId={collection?.id}
        />
      )}
    </EmptyStateWrapper>
  );
};

export const CollectionEmptyIcon = (): JSX.Element => {
  return (
    <Box w="6rem">
      <img src={EmptyStateIcon} alt={t`Empty collection illustration.`} />
    </Box>
  );
};

const EmptyStateTitle = ({ children }: PropsWithChildren) => {
  const theme = useMantineTheme();
  return (
    <Box
      c="text-dark"
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

const EmptyStateSubtitle = ({ children }: PropsWithChildren) => {
  const theme = useMantineTheme();
  return (
    <Text
      fz={theme.other.collectionBrowser.emptyContent.subtitle.fontSize}
      c="text-medium"
      ta="center"
      mb="1.5rem"
      maw="25rem"
    >
      {children}
    </Text>
  );
};

const EmptyStateWrapper = ({ children }: PropsWithChildren) => {
  return (
    <Stack data-testid="collection-empty-state" align="center" gap={0}>
      {children}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionEmptyState;
