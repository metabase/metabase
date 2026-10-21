import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Flex, Loader, Stack } from "metabase/ui";

type AiAnalyticsSectionLayoutProps = {
  children: ReactNode;
  emptyState: ReactNode;
  error: unknown;
  filters: ReactNode;
  isInitialLoading: boolean;
  isTableRoute: boolean;
  showEmpty: boolean;
  tabs: PillTab[];
  filtersAction?: ReactNode;
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
  filtersAction,
  title,
}: AiAnalyticsSectionLayoutProps) {
  const sectionContent = (
    <>
      <PillTabNavigation tabs={tabs} />
      <Flex justify="space-between" align="center" gap="md">
        {filters}
        {filtersAction}
      </Flex>
      <RouteContent
        emptyState={emptyState}
        error={error}
        isInitialLoading={isInitialLoading}
        showEmpty={showEmpty}
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
};

export function RouteContent({
  children,
  emptyState,
  error,
  isInitialLoading,
  showEmpty,
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
      <Flex mih="60vh" align="center" justify="center">
        <Loader size="lg" />
      </Flex>
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
