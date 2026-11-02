import type { ReactNode } from "react";

import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import {
  Box,
  Flex,
  Group,
  Skeleton,
  Stack,
  type StackProps,
} from "metabase/ui";

import { PageContainer } from "../PageContainer";

// Pill tabs are 0.6rem of padding around a 15px line.
const TAB_HEIGHT = 35;
const TAB_WIDTHS = [96, 132, 112, 88, 104, 80];
const CODE_LINE_COUNT = 8;

type PaneHeaderSkeletonProps = Omit<StackProps, "children"> & {
  /** Real breadcrumbs, for pages whose breadcrumbs don't depend on the loading data. */
  breadcrumbs?: ReactNode;
  tabCount?: number;
};

/** Stands in for a `PaneHeader`: breadcrumbs, an icon and title, and pill tabs. */
export function PaneHeaderSkeleton({
  breadcrumbs,
  tabCount = 0,
  ...props
}: PaneHeaderSkeletonProps) {
  return (
    <Stack gap={0} pt="xxs" {...props}>
      <Flex mb="xl" mt="lg" w="100%" h="xxl" align="center">
        {breadcrumbs ?? <Skeleton h={12} w={240} radius="xs" />}
      </Flex>
      <Stack gap="lg">
        <Group gap="sm" h={24} wrap="nowrap">
          <Skeleton h={20} w={20} radius="xs" />
          <Skeleton h={20} w={240} radius="xs" />
        </Group>
        {tabCount > 0 && (
          <Group gap="xxs" wrap="nowrap">
            {Array.from({ length: tabCount }, (_, index) => (
              <Skeleton
                key={index}
                h={TAB_HEIGHT}
                w={TAB_WIDTHS[index % TAB_WIDTHS.length]}
                radius="xl"
              />
            ))}
          </Group>
        )}
      </Stack>
    </Stack>
  );
}

export type PageSkeletonProps = Omit<StackProps, "children"> & {
  breadcrumbs?: ReactNode;
  tabCount?: number;
  /** Header padding, for pages that pad the header rather than the page. */
  headerPx?: StackProps["px"];
  children?: ReactNode;
};

/**
 * Loading state for a Data Studio entity page: a `PageContainer` holding a
 * `PaneHeader` skeleton above `children`, the skeleton of the page body.
 */
export function PageSkeleton({
  breadcrumbs,
  tabCount,
  headerPx,
  gap = "xxl",
  children,
  ...props
}: PageSkeletonProps) {
  return (
    <PageContainer {...props}>
      <LoadingSkeleton gap={gap} flex={1} mih={0}>
        <PaneHeaderSkeleton
          breadcrumbs={breadcrumbs}
          tabCount={tabCount}
          px={headerPx}
        />
        {children}
      </LoadingSkeleton>
    </PageContainer>
  );
}

/** A block filling the rest of the page, e.g. for a dependency graph card. */
export function PageCardSkeleton() {
  return <Skeleton flex={1} mih={320} radius="md" />;
}

type CodeEditorSkeletonProps = {
  /** Adds the query editor's top bar, with its data source picker. */
  withTopBar?: boolean;
};

/** A bordered code editor filling the rest of the page. */
export function CodeEditorSkeleton({
  withTopBar = false,
}: CodeEditorSkeletonProps) {
  return (
    <Stack
      flex={1}
      mih={320}
      gap={0}
      bg="background_page-primary"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
    >
      {withTopBar && (
        <Box
          p="md"
          style={{ borderBottom: "1px solid var(--mb-color-border-neutral)" }}
        >
          <Skeleton h={16} w={160} radius="xs" />
        </Box>
      )}
      <Stack gap="md" p="lg">
        {Array.from({ length: CODE_LINE_COUNT }, (_, index) => (
          <Skeleton
            key={index}
            h={12}
            w={getSkeletonLineWidth(index)}
            radius="xs"
          />
        ))}
      </Stack>
    </Stack>
  );
}
