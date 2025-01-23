import { t } from "ttag";

import SidesheetS from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { LoadingIndicator } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { InsightsLinkProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
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

  const isUserAdmin = useSelector(getUserIsAdmin);

  const collection = dashboard
    ? dashboard.collection
    : (question.collection() as Collection);

  if (isLoading) {
    return <LoadingIndicator />;
  }

  if (!isUserAdmin) {
    return null;
  }

  if (collection?.type === "instance-analytics") {
    return null;
  }

  if (error || !auditInfo) {
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
