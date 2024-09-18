import type { FocusEvent, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  Sidesheet,
  SidesheetCard,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import SidesheetS from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks";
import EditableText from "metabase/core/components/EditableText";
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
import { Stack, Switch, Tabs, Text } from "metabase/ui";
import type {
  CacheableDashboard,
  Dashboard,
  Revision,
  User,
} from "metabase-types/api";

import DashboardInfoSidebarS from "./DashboardInfoSidebar.module.css";

interface DashboardInfoSidebarProps {
  dashboard: Dashboard;
  setDashboardAttribute: <Key extends keyof Dashboard>(
    attribute: Key,
    value: Dashboard[Key],
  ) => void;
  onClose: () => void;
}

enum Tab {
  Overview = "overview",
  History = "history",
}

export function DashboardInfoSidebar({
  dashboard,
  setDashboardAttribute,
  onClose,
}: DashboardInfoSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState<"default" | "caching">("default");

  useMount(() => {
    // this component is not rendered until it is "open"
    // but we want to set isOpen after it mounts to get
    // pretty animations
    setIsOpen(true);
  });

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

  const canWrite = dashboard.can_write && !dashboard.archived;
  const showCaching = canWrite && PLUGIN_CACHING.isGranularCachingEnabled();

  if (page === "caching") {
    return (
      <PLUGIN_CACHING.SidebarCacheForm
        item={dashboard as CacheableDashboard}
        model="dashboard"
        onBack={() => setPage("default")}
        onClose={onClose}
        pt="md"
      />
    );
  }

  return (
    <div data-testid="sidebar-right">
      <ErrorBoundary>
        <Sidesheet
          isOpen={isOpen}
          title={t`Info`}
          onClose={onClose}
          removeBodyPadding
          size="md"
        >
          <Tabs
            defaultValue={Tab.Overview}
            className={SidesheetS.FlexScrollContainer}
          >
            <Tabs.List mx="lg">
              <Tabs.Tab value={Tab.Overview}>{t`Overview`}</Tabs.Tab>
              <Tabs.Tab value={Tab.History}>{t`History`}</Tabs.Tab>
            </Tabs.List>
            <SidesheetTabPanelContainer>
              <Tabs.Panel value={Tab.Overview}>
                <OverviewTab
                  dashboard={dashboard}
                  handleDescriptionChange={handleDescriptionChange}
                  handleDescriptionBlur={handleDescriptionBlur}
                  descriptionError={descriptionError}
                  setDescriptionError={setDescriptionError}
                  canWrite={canWrite}
                  setPage={setPage}
                  showCaching={showCaching}
                />
              </Tabs.Panel>
              <Tabs.Panel value={Tab.History}>
                <HistoryTab
                  canWrite={canWrite}
                  revisions={revisions}
                  currentUser={currentUser}
                />
              </Tabs.Panel>
            </SidesheetTabPanelContainer>
          </Tabs>
        </Sidesheet>
      </ErrorBoundary>
    </div>
  );
}

const OverviewTab = ({
  dashboard,
  handleDescriptionChange,
  handleDescriptionBlur,
  descriptionError,
  setDescriptionError,
  canWrite,
  setPage,
  showCaching,
}: {
  dashboard: Dashboard;
  handleDescriptionChange: (description: string) => void;
  handleDescriptionBlur: (event: FocusEvent<HTMLTextAreaElement>) => void;
  descriptionError: string | null;
  setDescriptionError: (error: string | null) => void;
  canWrite: boolean;
  setPage: (
    page: "default" | "caching" | SetStateAction<"default" | "caching">,
  ) => void;
  showCaching: boolean;
}) => {
  const isCacheable = isDashboardCacheable(dashboard);
  const autoApplyFilterToggleId = useUniqueId();
  const dispatch = useDispatch();
  const handleToggleAutoApplyFilters = useCallback(
    (isAutoApplyingFilters: boolean) => {
      dispatch(toggleAutoApplyFilters(isAutoApplyingFilters));
    },
    [dispatch],
  );

  return (
    <Stack spacing="lg">
      <SidesheetCard title={t`Description`} pb="md">
        <div className={DashboardInfoSidebarS.EditableTextContainer}>
          <EditableText
            initialValue={dashboard.description}
            isDisabled={!canWrite}
            onChange={handleDescriptionChange}
            onFocus={() => setDescriptionError("")}
            onBlur={handleDescriptionBlur}
            isOptional
            isMultiline
            isMarkdown
            placeholder={t`Add description`}
          />
        </div>
        {!!descriptionError && (
          <Text color="error" size="xs" mt="xs">
            {descriptionError}
          </Text>
        )}
      </SidesheetCard>

      {!dashboard.archived && (
        <SidesheetCard>
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
        </SidesheetCard>
      )}

      {showCaching && isCacheable && (
        <SidesheetCard title={t`Caching`} pb="md">
          <PLUGIN_CACHING.SidebarCacheSection
            model="dashboard"
            item={dashboard}
            setPage={setPage}
          />
        </SidesheetCard>
      )}
    </Stack>
  );
};

const HistoryTab = ({
  canWrite,
  revisions,
  currentUser,
}: {
  canWrite: boolean;
  revisions?: Revision[];
  currentUser: User | null;
}) => {
  const dispatch = useDispatch();
  return (
    <SidesheetCard>
      <Timeline
        events={getTimelineEvents({ revisions, currentUser })}
        data-testid="dashboard-history-list"
        revert={revision => dispatch(revertToRevision(revision))}
        canWrite={canWrite}
      />
    </SidesheetCard>
  );
};
