import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import SidesheetS from "metabase/common/components/Sidesheet/sidesheet.module.css";
import * as Urls from "metabase/lib/urls";
import type { InsightsLinkProps } from "metabase/plugins";
import { Flex, Icon } from "metabase/ui";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

import S from "./InsightsLink.module.css";

export const InsightsLink = ({
  question,
  dashboard,
  ...linkProps
}: InsightsLinkProps) => {
  const { data: auditInfo, error, isLoading } = useGetAuditInfoQuery();

  const collection = dashboard
    ? dashboard.collection
    : (question.collection() as Collection);

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
    <Link
      to={instanceAnalyticsUrl}
      className={S.InsightsLink}
      role="link"
      {...linkProps}
    >
      <Flex gap="xs" className={SidesheetS.TabSibling}>
        <Icon name="external" />
        {t`Insights`}
      </Flex>
    </Link>
  );
};
