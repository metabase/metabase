import type { Dispatch, FocusEvent, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks";
import {
  revertToRevision,
  toggleAutoApplyFilters,
  updateDashboard,
} from "metabase/dashboard/actions";
import { DASHBOARD_DESCRIPTION_MAX_LENGTH } from "metabase/dashboard/constants";
import { isDashboardCacheable } from "metabase/dashboard/utils";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_CACHING } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";
import { Text, Stack, Switch } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import {
  ContentSection,
  DashboardInfoSidebarRoot,
  DescriptionHeader,
  EditableDescription,
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
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const { data: revisions } = useRevisionListQuery({
    query: { model_type: "dashboard", model_id: dashboard.id },
  });

  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const handleDescriptionChange = useCallback(
    (description: string) => {
      if (description.length <= DASHBOARD_DESCRIPTION_MAX_LENGTH) {
        setDashboardAttribute?.("description", description);
        dispatch(updateDashboard({ attributeNames: ["description"] }));
      }
    },
    [dispatch, setDashboardAttribute],
  );

  const handleDescriptionBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      if (event.target.value.length > DASHBOARD_DESCRIPTION_MAX_LENGTH) {
        setDescriptionError(
          t`Must be ${DASHBOARD_DESCRIPTION_MAX_LENGTH} characters or less`,
        );
      }
    },
    [],
  );

  const handleToggleAutoApplyFilters = useCallback(
    (isAutoApplyingFilters: boolean) => {
      dispatch(toggleAutoApplyFilters(isAutoApplyingFilters));
    },
    [dispatch],
  );

  const autoApplyFilterToggleId = useUniqueId();
  const canWrite = dashboard.can_write;
  const isCacheable = isDashboardCacheable(dashboard);

  const showCaching = canWrite && PLUGIN_CACHING.isEnabled();

  return (
    <>
      <ContentSection>
        <DescriptionHeader>{t`About`}</DescriptionHeader>
        <EditableDescription
          initialValue={dashboard.description}
          isDisabled={!canWrite}
          onChange={handleDescriptionChange}
          onFocus={() => setDescriptionError("")}
          onBlur={handleDescriptionBlur}
          isOptional
          isMultiline
          isMarkdown
          hasError={!!descriptionError}
          placeholder={t`Add description`}
          key={`dashboard-description-${dashboard.description}`}
          style={{ fontSize: ".875rem" }}
        />
        {!!descriptionError && (
          <Text color="error" size="xs" mt="xs">
            {descriptionError}
          </Text>
        )}
      </ContentSection>

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
