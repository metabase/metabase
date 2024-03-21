import { push } from "react-router-redux";
import { t } from "ttag";

import EntityMenuItem from "metabase/components/EntityMenuItem";
import { useDispatch } from "metabase/lib/redux";
import { useGetAuditInfoQuery } from "metabase-enterprise/api";
import type { DashboardId } from "metabase-types/api";

interface InstanceAnalyticsButtonProps {
  model: "dashboard" | "question";
  linkQueryParams: { dashboard_id: DashboardId } | { question_id: number };
}

export const InstanceAnalyticsButton = ({
  model,
  linkQueryParams,
}: InstanceAnalyticsButtonProps) => {
  const dispatch = useDispatch();
  const { data: auditInfo, error, isLoading } = useGetAuditInfoQuery();

  if (isLoading || error || !auditInfo) {
    return null;
  }

  const entityId =
    model === "dashboard"
      ? auditInfo.dashboard_overview
      : auditInfo.question_overview;

  if (entityId !== undefined) {
    return (
      <EntityMenuItem
        icon="audit"
        title={t`Usage insights`}
        action={() => {
          dispatch(
            push({
              pathname: `/dashboard/${entityId}`,
              query: linkQueryParams,
            }),
          );
        }}
      />
    );
  } else {
    return null;
  }
};
