import dayjs from "dayjs";
import { Link } from "react-router";
import { t } from "ttag";

import { Anchor, Badge, Flex, Loader, Text, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

import { formatRelativeDate } from "../NotificationsAdminPage/utils";

import { DetailsRow } from "./DetailsRow";
import { DetailsTable } from "./DetailsTable";
import { SidebarSection } from "./SidebarSection";
import type { NotificationRunSummaryLogProps } from "./types";

export const NotificationRunSummaryLog = ({
  title,
  runs,
  isLoading,
  cardId,
  onViewAllClick,
}: NotificationRunSummaryLogProps) => {
  const viewAllUrl = Urls.adminToolsTasksRunsFor({
    runType: "alert",
    entityType: "card",
    entityId: cardId,
    startedAt: "past3months",
    includeToday: true,
  });

  const renderRuns = () => {
    if (isLoading) {
      return (
        <Flex align="center" justify="center" py="lg">
          <Loader size="sm" data-testid="run-summary-loader" />
        </Flex>
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
          px="md"
          py="sm"
          gap="sm"
        >
          <Tooltip label={dayjs(run.at).fromNow()}>
            <Text size="md" c="text-primary" component="span">
              {formatRelativeDate(run.at)}
            </Text>
          </Tooltip>
          <Tooltip label={run.error} disabled={!hasError}>
            <Badge
              color={isFailing ? "error" : undefined}
              variant={isFailing ? "light" : "outline"}
              radius="lg"
              tt="none"
              fw="normal"
              c={isFailing ? undefined : "text-secondary"}
              bd={
                isFailing
                  ? undefined
                  : "1px solid var(--mb-color-border-neutral)"
              }
              style={hasError ? { cursor: "pointer" } : undefined}
            >
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
