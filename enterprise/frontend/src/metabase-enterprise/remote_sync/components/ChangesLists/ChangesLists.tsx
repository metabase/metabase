import { t } from "ttag";

import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { Box, Group, Paper, Skeleton, Stack, Text, Title } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";

import { AllChangesView } from "./AllChangesView";

const SKELETON_ENTITY_COUNT = 3;

interface ChangesListsProps {
  title?: string;
}

export const ChangesLists = ({ title }: ChangesListsProps) => {
  const { data: dirtyData, isLoading: isLoadingChanges } =
    useGetRemoteSyncChangesQuery(undefined, {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
    });

  if (isLoadingChanges) {
    return <ChangesListsSkeleton title={title} />;
  }

  const allEntities = dirtyData?.dirty || [];

  if (allEntities.length === 0) {
    return (
      <Box ta="center" py="xxl">
        <Text c="text-disabled" size="sm">
          {t`No changes to push`}
        </Text>
      </Box>
    );
  }

  return <AllChangesView entities={allEntities} title={title} />;
};

// Mirrors one collection group of `AllChangesView`
const ChangesListsSkeleton = ({ title }: ChangesListsProps) => (
  <LoadingSkeleton gap={0}>
    {!!title && (
      <Title order={4} mb="lg" c="text-secondary">
        {title}
      </Title>
    )}
    <Paper withBorder radius="sm">
      <Box p="lg">
        <Group
          p="sm"
          gap="sm"
          mb="0.75rem"
          bg="background_page-secondary"
          bdrs="sm"
          wrap="nowrap"
        >
          <Skeleton h={16} w={16} radius="xs" flex="none" />
          <Skeleton h={12} w="40%" radius="xs" />
        </Group>
        <Stack
          gap="0.75rem"
          ml="lg"
          pl="xxs"
          style={{ borderLeft: "2px solid var(--mb-color-border-neutral)" }}
        >
          {Array.from({ length: SKELETON_ENTITY_COUNT }, (_, index) => (
            <Group key={index} gap="sm" wrap="nowrap" px="sm">
              <Skeleton h={16} w={16} radius="xs" flex="none" />
              <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
            </Group>
          ))}
        </Stack>
      </Box>
    </Paper>
  </LoadingSkeleton>
);
