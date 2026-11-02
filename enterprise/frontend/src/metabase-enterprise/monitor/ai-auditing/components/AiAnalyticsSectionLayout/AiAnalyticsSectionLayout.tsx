import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import {
  Card,
  Flex,
  SimpleGrid,
  Skeleton,
  Stack,
  TreeTableSkeleton,
} from "metabase/ui";

type AiAnalyticsSectionLayoutProps = {
  children: ReactNode;
  emptyState: ReactNode;
  error: unknown;
  filters: ReactNode;
  isInitialLoading: boolean;
  isTableRoute: boolean;
  showEmpty: boolean;
  tabs: PillTab[];
  title: string;
};

export function AiAnalyticsSectionLayout({
  children,
  emptyState,
  error,
  filters,
  isInitialLoading,
  isTableRoute,
  showEmpty,
  tabs,
  title,
}: AiAnalyticsSectionLayoutProps) {
  const sectionContent = (
    <>
      <PillTabNavigation tabs={tabs} />
      {filters}
      <RouteContent
        emptyState={emptyState}
        error={error}
        isInitialLoading={isInitialLoading}
        showEmpty={showEmpty}
        loader={isTableRoute ? <AnalyticsTableSkeleton /> : undefined}
      >
        {children}
      </RouteContent>
    </>
  );

  if (isTableRoute) {
    return (
      <Flex h="100%" wrap="nowrap">
        <MonitorMain>
          <Stack gap="xl" flex={1} mih={0}>
            <MonitorHeaderTitle>{title}</MonitorHeaderTitle>
            <Stack
              gap="lg"
              flex={1}
              mih={0}
              display="flex"
              style={{ flexDirection: "column" }}
            >
              {sectionContent}
            </Stack>
          </Stack>
        </MonitorMain>
      </Flex>
    );
  }

  return (
    <MonitorMain>
      <Stack gap="xl">
        <MonitorHeaderTitle>{title}</MonitorHeaderTitle>
        <Stack gap="lg">{sectionContent}</Stack>
      </Stack>
    </MonitorMain>
  );
}

type RouteContentProps = {
  children: ReactNode;
  emptyState: ReactNode;
  error: unknown;
  isInitialLoading: boolean;
  showEmpty: boolean;
  /** Placeholder for the initial load. Defaults to a layout of chart cards. */
  loader?: ReactNode;
};

export function RouteContent({
  children,
  emptyState,
  error,
  isInitialLoading,
  showEmpty,
  loader = <AnalyticsChartsSkeleton />,
}: RouteContentProps) {
  if (error !== undefined && error !== null) {
    return (
      <Flex mih="60vh" align="center" justify="center">
        <LoadingAndErrorWrapper loading={false} error={error} />
      </Flex>
    );
  }

  if (isInitialLoading) {
    return (
      <LoadingSkeleton gap={0} flex="0 1 auto" mih={0}>
        {loader}
      </LoadingSkeleton>
    );
  }

  if (showEmpty) {
    return (
      <Flex flex={1} mih="60vh" align="center" justify="center">
        {emptyState}
      </Flex>
    );
  }

  return children;
}

// Matches the chart heights of the usage pages: a timeline over two breakouts
function AnalyticsChartsSkeleton() {
  return (
    <Stack gap="xl">
      <Skeleton h={320} />
      <SimpleGrid cols={2} spacing="xl">
        <Skeleton h={500} />
        <Skeleton h={500} />
      </SimpleGrid>
    </Stack>
  );
}

const TABLE_SKELETON_COLUMN_WIDTHS = [0.2, 0.2, 0.2, 0.2, 0.2];

function AnalyticsTableSkeleton() {
  return (
    <Card withBorder p={0} mih={0}>
      <TreeTableSkeleton
        rowsCount={12}
        columnWidths={TABLE_SKELETON_COLUMN_WIDTHS}
      />
    </Card>
  );
}
