import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { dayjs } from "metabase/dayjs";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/monitor/components/DetailSidebar";
import { Anchor, Badge, Flex, Text, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

import { formatRelativeDate } from "../NotificationsAdminPage/utils";

import { RunHistoryRowsSkeleton } from "./NotificationDetailSidebarSkeleton";
import type { NotificationRunSummaryLogProps } from "./types";

export const NotificationRunSummaryLog = ({
  title,
  runs,
  isLoading,
  cardId,
  onViewAllClick,
}: NotificationRunSummaryLogProps) => {
  const viewAllUrl = Urls.monitorTasksRunsFor({
    runType: "alert",
    entityType: "card",
    entityId: cardId,
    startedAt: "past3months",
    includeToday: true,
  });

  const renderRuns = () => {
    if (isLoading && runs == null) {
      return (
        <LoadingSkeleton gap={0} data-testid="run-summary-loader">
          <RunHistoryRowsSkeleton />
        </LoadingSkeleton>
      );
    }
    if (runs && runs.length === 0) {
      return (
        <DetailsRow
          label={t`No runs in the past 90 days.`}
          value=""
          bold={false}
          spanLabel
        />
      );
    }
    return runs?.map((run, index) => {
      const isFailing = run.status === "failing";
      const hasError = isFailing && !!run.error;
      return (
        <Flex
          key={index}
          align="center"
          justify="space-between"
          px="lg"
          py="sm"
          gap="sm"
        >
          <Tooltip label={dayjs(run.at).fromNow()}>
            <Text size="md" c="text-primary" component="span">
              {formatRelativeDate(run.at)}
            </Text>
          </Tooltip>
          <Tooltip label={run.error} disabled={!hasError}>
            <Badge color={isFailing ? "negative" : "positive"} variant="light">
              {isFailing ? t`Failed` : t`Successful`}
            </Badge>
          </Tooltip>
        </Flex>
      );
    });
  };

  return (
    <SidebarSection
      title={title}
      titleAside={
        <Anchor
          component={Link}
          to={viewAllUrl}
          c="core-brand"
          fz="md"
          lh="1rem"
          fw="bold"
          onClick={onViewAllClick}
        >
          {t`View all`}
        </Anchor>
      }
    >
      <DetailsTable>{renderRuns()}</DetailsTable>
    </SidebarSection>
  );
};
