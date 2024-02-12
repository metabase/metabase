import { t } from "ttag";
import { useEffect } from "react";
import { push } from "react-router-redux";
import { loadInfo } from "metabase-enterprise/audit_app/reducer";
import EntityMenuItem from "metabase/components/EntityMenuItem";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { AuditInfoState } from "metabase-enterprise/audit_app/types/state";
import type { DashboardId } from "metabase-types/api";

interface InstanceAnalyticsButtonProps {
  entitySelector: (state: AuditInfoState) => number;
  linkQueryParams: { dashboard_id: DashboardId } | { question_id: number };
}

export const InstanceAnalyticsButton = ({
  entitySelector,
  linkQueryParams,
}: InstanceAnalyticsButtonProps) => {
  const dispatch = useDispatch();
  const entityId = useSelector(state =>
    entitySelector(state as AuditInfoState),
  );

  useEffect(() => {
    dispatch(loadInfo());
  }, [dispatch]);

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
