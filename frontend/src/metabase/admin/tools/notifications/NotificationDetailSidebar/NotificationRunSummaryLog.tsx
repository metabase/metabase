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
}: NotificationRunSummaryLogProps) => {
  const viewAllUrl = Urls.adminToolsTasksRunsFor({
    runType: "alert",
    entityType: "card",
    entityId: cardId,
  });

  const renderRuns = () => {
    if (isLoading) {
      return (
        <Flex align="center" justify="center" py="lg">
          <Loader size="sm" />
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
      return (
        <Flex
          key={index}
          align="center"
          justify="space-between"
          px="md"
          py="sm"
          gap="sm"
        >
          <Text size="md" c="text-primary">
            {formatRelativeDate(run.at)}
          </Text>
          <Tooltip label={run.error} disabled={!isFailing || !run.error}>
            <Badge
              color={isFailing ? "error" : undefined}
              variant={isFailing ? "light" : "outline"}
              radius="lg"
              tt="none"
              fw="normal"
              c={isFailing ? undefined : "text-secondary"}
              bd={isFailing ? undefined : "1px solid var(--mb-color-border)"}
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
          c="brand"
          fz="md"
          lh="1rem"
          fw="bold"
        >
          {t`View all`}
        </Anchor>
      }
    >
      <DetailsTable>{renderRuns()}</DetailsTable>
    </SidebarSection>
  );
};
