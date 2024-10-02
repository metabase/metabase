import { t } from "ttag";

import SidesheetS from "metabase/common/components/Sidesheet/sidesheet.module.css";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import type { InsightsTabOrLinkProps } from "metabase/plugins";
import { Flex, Icon } from "metabase/ui";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

import S from "./InsightsLink.module.css";

export const InsightsLink = ({
  question,
  dashboard,
  ...props
}: InsightsTabOrLinkProps) => {
  const { data: auditInfo, error, isLoading } = useGetAuditInfoQuery();

  const collection = dashboard
    ? dashboard.collection
    : (question.collection() as Collection);

  if (collection?.type === "instance-analytics") {
    return null;
  }

  if (isLoading || error || !auditInfo) {
    return null;
  }

  const entityId = dashboard
    ? auditInfo.dashboard_overview
    : auditInfo.question_overview;

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
    <Flex
      className={SidesheetS.InsightsTab}
      p="11px 8px"
      c="var(--mb-color-text-dark)"
      fw="bold"
      lh="1rem"
    >
      <Link
        to={instanceAnalyticsUrl}
        className={S.InsightsLink}
        role="link"
        {...props}
      >
        <Flex gap="xs">
          <Icon name="external" />
          {t`Insights`}
        </Flex>
      </Link>
    </Flex>
  );
};
