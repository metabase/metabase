import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type { InsightsLinkProps } from "metabase/plugins";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

export const InsightsLink = ({ question, dashboard }: InsightsLinkProps) => {
  const { data: auditInfo, error, isLoading } = useGetAuditInfoQuery();

  const collection = dashboard
    ? dashboard.collection
    : // Unjustified type cast. FIXME
      (question.collection() as Collection);

  if (isLoading) {
    return <div data-testid="loading-indicator" />;
  }

  if (collection?.type === "instance-analytics") {
    return null;
  }

  if (
    error ||
    !auditInfo ||
    (!auditInfo.dashboard_overview && !auditInfo.question_overview)
  ) {
    return null;
  }

  const entityId = dashboard
    ? auditInfo.dashboard_overview
    : auditInfo.question_overview;

  if (!entityId) {
    return null;
  }

  const linkQueryParams = new URLSearchParams(
    dashboard
      ? {
          dashboard_id: dashboard.id.toString(),
        }
      : {
          question_id: question.id().toString(),
        },
  );

  const instanceAnalyticsUrl =
    Urls.dashboard({ id: entityId, name: "" }) + `?${linkQueryParams}`;

  return (
    <Tooltip label={t`Insights`}>
      <ActionIcon
        component={Link}
        to={instanceAnalyticsUrl}
        variant="subtle"
        size="md"
        c="text-primary"
        aria-label={t`Insights`}
      >
        <Icon name="insight" />
      </ActionIcon>
    </Tooltip>
  );
};
