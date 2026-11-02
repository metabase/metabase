import type { ReactNode } from "react";

import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  type PaneHeaderProps,
} from "metabase/common/data-studio/components/PaneHeader";
import {
  Card,
  Flex,
  Group,
  Skeleton,
  Stack,
  type StackProps,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

const TAB_WIDTHS = [88, 80, 96, 104, 112];

type PaneHeaderSkeletonProps = Omit<
  PaneHeaderProps,
  "title" | "tabs" | "breadcrumbs" | "icon"
> & {
  icon: IconName;
  tabCount: number;
};

/** A `PaneHeader` whose breadcrumbs, title, and tabs are placeholders. */
export function PaneHeaderSkeleton({
  icon,
  tabCount,
  ...props
}: PaneHeaderSkeletonProps) {
  return (
    <PaneHeader
      icon={icon}
      title={<Skeleton h={24} w={240} radius="xs" />}
      tabs={
        <Flex gap="xxs">
          {Array.from({ length: tabCount }, (_, index) => (
            <Skeleton
              key={index}
              h={35}
              w={TAB_WIDTHS[index % TAB_WIDTHS.length]}
              radius="xl"
            />
          ))}
        </Flex>
      }
      breadcrumbs={
        <Flex align="center">
          <Skeleton h={12} w={200} radius="xs" />
        </Flex>
      }
      {...props}
    />
  );
}

type DataStudioPageSkeletonProps = Omit<StackProps, "children"> & {
  icon: IconName;
  tabCount: number;
  /** Placeholder for the page body below the header. */
  children: ReactNode;
};

/**
 * Loading state for a Data Studio entity page: the page container, a header
 * placeholder, and the given body placeholder.
 */
export function DataStudioPageSkeleton({
  icon,
  tabCount,
  children,
  ...props
}: DataStudioPageSkeletonProps) {
  return (
    <LoadingSkeleton h="100%" gap={0}>
      <PageContainer {...props}>
        <PaneHeaderSkeleton icon={icon} tabCount={tabCount} />
        {children}
      </PageContainer>
    </LoadingSkeleton>
  );
}

type CardListSkeletonProps = Omit<StackProps, "children"> & {
  rows: number;
  /** Adds a description line under each card's name. */
  withDescription?: boolean;
};

/** Bordered cards with an icon and a name, like the cards of `EntityList`. */
export function CardListSkeleton({
  rows,
  withDescription = false,
  gap = "sm",
  ...props
}: CardListSkeletonProps) {
  return (
    <Stack gap={gap} {...props}>
      {Array.from({ length: rows }, (_, index) => (
        <Card key={index} withBorder shadow="none" px="lg" py={12}>
          <Stack gap={12}>
            <Group gap="sm" wrap="nowrap" h={21}>
              <Skeleton h={16} w={16} radius="xs" flex="none" />
              <Skeleton
                h={12}
                w={`calc(${getSkeletonLineWidth(index)} / 2)`}
                radius="xs"
              />
            </Group>
            {withDescription && (
              <Skeleton
                h={12}
                w={getSkeletonLineWidth(index + 3)}
                radius="xs"
              />
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

type EntityListSkeletonProps = {
  rows?: number;
};

/** Placeholder for an `EntityList`: its title row and a few cards. */
export function EntityListSkeleton({ rows = 4 }: EntityListSkeletonProps) {
  return (
    <Stack gap="lg">
      <Group h={40}>
        <Skeleton h={18} w={120} radius="xs" />
      </Group>
      <CardListSkeleton rows={rows} />
    </Stack>
  );
}
