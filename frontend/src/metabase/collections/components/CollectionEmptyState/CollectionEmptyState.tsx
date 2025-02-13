import type { PropsWithChildren } from "react";
import { t } from "ttag";

import { isRootTrashCollection } from "metabase/collections/utils";
import NewItemMenu from "metabase/containers/NewItemMenu";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { Box, Icon, Stack, Text, useMantineTheme } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import {
  EmptyStateIconBackground,
  EmptyStateIconForeground,
} from "./CollectionEmptyState.styled";

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
        {t`Use collections to organize and group dashboards and questions for your team or yourself`}
      </EmptyStateSubtitle>
      {canWrite && (
        <NewItemMenu
          trigger={<Button icon="add">{t`Create a new…`}</Button>}
          collectionId={collection?.id}
        />
      )}
    </EmptyStateWrapper>
  );
};

export const CollectionEmptyIcon = (): JSX.Element => {
  const theme = useMantineTheme();

  return (
    <svg
      viewBox="0 0 117 94"
      width={theme.other.collectionBrowser.emptyContent.icon.width}
      height={theme.other.collectionBrowser.emptyContent.icon.height}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <EmptyStateIconForeground
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.5 1C6.148 1 .995 6.151 1 12.505l.023 69C1.029 87.854 6.175 93 12.523 93H104.5C110.853 93 116 87.851 116 81.5V22.196c0-6.352-5.147-11.5-11.501-11.5H65.357a5.752 5.752 0 0 1-5.307-3.533l-1.099-2.63A5.752 5.752 0 0 0 53.644 1H12.5Z"
        strokeWidth="2"
      />
      <EmptyStateIconBackground
        d="M1 13C1 6.373 6.373 1 13 1h39.76a8 8 0 0 1 7.017 4.157l.446.815a8 8 0 0 0 7.017 4.158H107a9 9 0 0 1 9 9V26l-2.714-3.137a16.003 16.003 0 0 0-12.099-5.53H15.383a16 16 0 0 0-13.155 6.893L1 26V13Z"
        strokeWidth="2"
      />
    </svg>
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
      size={theme.other.collectionBrowser.emptyContent.subtitle.fontSize}
      color="text-medium"
      align="center"
      mb="1.5rem"
    >
      {children}
    </Text>
  );
};

const EmptyStateWrapper = ({ children }: PropsWithChildren) => {
  return (
    <Stack data-testid="collection-empty-state" align="center" spacing={0}>
      {children}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionEmptyState;
