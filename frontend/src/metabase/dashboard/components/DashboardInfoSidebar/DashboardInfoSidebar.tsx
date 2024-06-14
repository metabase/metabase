import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks";
import EditableText from "metabase/core/components/EditableText";
import {
  revertToRevision,
  toggleAutoApplyFilters,
  updateDashboard,
} from "metabase/dashboard/actions";
import { isDashboardCacheable } from "metabase/dashboard/utils";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useDispatch, useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";
import { Stack, Switch } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import {
  ContentSection,
  DashboardInfoSidebarRoot,
  DescriptionHeader,
  HistoryHeader,
} from "./DashboardInfoSidebar.styled";

type DashboardAttributeType = string | number | null | boolean;

interface DashboardInfoSidebarProps {
  dashboard: Dashboard;
  setDashboardAttribute: (name: string, value: DashboardAttributeType) => void;
}

export function DashboardInfoSidebar({
  dashboard,
  setDashboardAttribute,
}: DashboardInfoSidebarProps) {
  const [page, setPage] = useState<"default" | "caching">("default");

  return (
    <DashboardInfoSidebarRoot
      style={{ padding: page === "default" ? "0 2rem 0.5rem" : "1rem 0 0 0" }}
      data-testid="sidebar-right"
    >
      <ErrorBoundary>
        {page === "default" && (
          <DashboardInfoSidebarBody
            dashboard={dashboard}
            setDashboardAttribute={setDashboardAttribute}
            setPage={setPage}
          />
        )}
        {page === "caching" && (
          <PLUGIN_CACHING.DashboardStrategySidebar
            dashboard={dashboard}
            setPage={setPage}
          />
        )}
      </ErrorBoundary>
    </DashboardInfoSidebarRoot>
  );
}

export type DashboardSidebarPageProps = {
  dashboard: Dashboard;
  setPage: Dispatch<SetStateAction<"default" | "caching">>;
  setDashboardAttribute: DashboardInfoSidebarProps["setDashboardAttribute"];
};

const DashboardInfoSidebarBody = ({
  dashboard,
  setDashboardAttribute,
  setPage,
}: DashboardSidebarPageProps) => {
  const { data: revisions } = useRevisionListQuery({
    query: { model_type: "dashboard", model_id: dashboard.id },
  });

  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const handleDescriptionChange = useCallback(
    (description: string) => {
      setDashboardAttribute?.("description", description);
      dispatch(updateDashboard({ attributeNames: ["description"] }));
    },
    [dispatch, setDashboardAttribute],
  );

  const handleToggleAutoApplyFilters = useCallback(
    (isAutoApplyingFilters: boolean) => {
      dispatch(toggleAutoApplyFilters(isAutoApplyingFilters));
    },
    [dispatch],
  );

  const autoApplyFilterToggleId = useUniqueId();
  const canWrite = dashboard.can_write && !dashboard.archived;
  const isCacheable = isDashboardCacheable(dashboard);

  const showCaching = canWrite && PLUGIN_CACHING.isEnabled();

  return (
    <>
      <ContentSection>
        <DescriptionHeader>{t`About`}</DescriptionHeader>
        <EditableText
          initialValue={dashboard.description}
          isDisabled={!canWrite}
          onChange={handleDescriptionChange}
          isOptional
          isMultiline
          isMarkdown
          placeholder={t`Add description`}
          key={`dashboard-description-${dashboard.description}`}
          style={{ fontSize: ".875rem" }}
        />
      </ContentSection>

      {!dashboard.archived && (
        <ContentSection>
          <Stack spacing="md">
            <Switch
              disabled={!canWrite}
              label={t`Auto-apply filters`}
              labelPosition="left"
              variant="stretch"
              size="sm"
              id={autoApplyFilterToggleId}
              checked={dashboard.auto_apply_filters}
              onChange={e => handleToggleAutoApplyFilters(e.target.checked)}
            />
            {showCaching && isCacheable && (
              <PLUGIN_CACHING.SidebarCacheSection
                model="dashboard"
                item={dashboard}
                setPage={setPage}
              />
            )}
          </Stack>
        </ContentSection>
      )}

      <ContentSection>
        <HistoryHeader>{t`History`}</HistoryHeader>
        <Timeline
          events={getTimelineEvents({ revisions, currentUser })}
          data-testid="dashboard-history-list"
          revert={revision => dispatch(revertToRevision(revision))}
          canWrite={canWrite}
        />
      </ContentSection>
    </>
  );
};
