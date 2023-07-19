import { useCallback } from "react";
import { t } from "ttag";

import { PLUGIN_CACHING } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";

import { Timeline } from "metabase/common/components/Timeline";
import EditableText from "metabase/core/components/EditableText";

import { Dashboard } from "metabase-types/api";
import { getUser } from "metabase/selectors/user";

import {
  revertToRevision,
  updateDashboard,
  toggleAutoApplyFilters,
} from "metabase/dashboard/actions";

import Toggle from "metabase/core/components/Toggle";
import FormField from "metabase/core/components/FormField";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks/use-revision-list-query";
import {
  DashboardInfoSidebarRoot,
  HistoryHeader,
  ContentSection,
  DescriptionHeader,
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
  const { data: revisions } = useRevisionListQuery({
    query: { model_type: "dashboard", model_id: dashboard.id },
  });

  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const showCaching =
    PLUGIN_CACHING.isEnabled() && MetabaseSettings.get("enable-query-caching");

  const handleDescriptionChange = useCallback(
    (description: string) => {
      setDashboardAttribute("description", description);
      dispatch(updateDashboard({ attributeNames: ["description"] }));
    },
    [dispatch, setDashboardAttribute],
  );

  const handleUpdateCacheTTL = useCallback(
    (cache_ttl: number | null) => {
      setDashboardAttribute("cache_ttl", cache_ttl);
      dispatch(updateDashboard({ attributeNames: ["cache_ttl"] }));
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
  const canWrite = dashboard.can_write;

  return (
    <DashboardInfoSidebarRoot data-testid="sidebar-right">
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
        />
      </ContentSection>

      <ContentSection>
        <FormField
          title={t`Auto-apply filters`}
          orientation="horizontal"
          htmlFor={autoApplyFilterToggleId}
        >
          <Toggle
            disabled={!canWrite}
            id={autoApplyFilterToggleId}
            value={dashboard.auto_apply_filters}
            onChange={handleToggleAutoApplyFilters}
          />
        </FormField>
      </ContentSection>
      {showCaching && (
        <ContentSection>
          <PLUGIN_CACHING.DashboardCacheSection
            dashboard={dashboard}
            onSave={handleUpdateCacheTTL}
          />
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
    </DashboardInfoSidebarRoot>
  );
}
