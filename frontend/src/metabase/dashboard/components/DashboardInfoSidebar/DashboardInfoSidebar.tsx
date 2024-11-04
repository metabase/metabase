import type { FocusEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import {
  Sidesheet,
  SidesheetCard,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import { InsightsTabOrLink } from "metabase/common/components/Sidesheet/components/InsightsTabOrLink";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import SidesheetS from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks";
import { revertToRevision, updateDashboard } from "metabase/dashboard/actions";
import { DASHBOARD_DESCRIPTION_MAX_LENGTH } from "metabase/dashboard/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { getUser } from "metabase/selectors/user";
import { Stack, Tabs, Text } from "metabase/ui";
import type {
  Dashboard,
  ModerationReview,
  Revision,
  User,
} from "metabase-types/api";

import { DashboardDetails } from "./DashboardDetails";
import { DashboardEntityIdCard } from "./DashboardEntityIdCard";
import { InsightsUpsellTab } from "./components/InsightsUpsellTab";

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
  Insights = "insights",
}

export function DashboardInfoSidebar({
  dashboard,
  setDashboardAttribute,
  onClose,
}: DashboardInfoSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

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

  const isIADashboard = useMemo(
    () =>
      dashboard.collection &&
      isInstanceAnalyticsCollection(dashboard?.collection),
    [dashboard.collection],
  );

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
            <Tabs.List mx="xl">
              <Tabs.Tab value={Tab.Overview}>{t`Overview`}</Tabs.Tab>
              {!isIADashboard && (
                <Tabs.Tab value={Tab.History}>{t`History`}</Tabs.Tab>
              )}
              <InsightsTabOrLink dashboard={dashboard} />
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
                />
              </Tabs.Panel>
              <Tabs.Panel value={Tab.History}>
                <HistoryTab
                  canWrite={canWrite}
                  revisions={revisions}
                  currentUser={currentUser}
                  moderationReviews={dashboard.moderation_reviews}
                />
              </Tabs.Panel>
              <Tabs.Panel value={Tab.Insights}>
                <InsightsUpsellTab model="dashboard" />
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
}: {
  dashboard: Dashboard;
  handleDescriptionChange: (description: string) => void;
  handleDescriptionBlur: (event: FocusEvent<HTMLTextAreaElement>) => void;
  descriptionError: string | null;
  setDescriptionError: (error: string | null) => void;
  canWrite: boolean;
}) => {
  return (
    <Stack spacing="lg">
      <SidesheetCard title={t`Description`} pb="md">
        <SidesheetEditableDescription
          description={dashboard.description}
          onChange={handleDescriptionChange}
          canWrite={canWrite}
          onFocus={() => setDescriptionError("")}
          onBlur={handleDescriptionBlur}
        />
        {!!descriptionError && (
          <Text color="error" size="xs" mt="xs">
            {descriptionError}
          </Text>
        )}
        <PLUGIN_MODERATION.ModerationReviewTextForDashboard
          dashboard={dashboard}
        />
      </SidesheetCard>
      <SidesheetCard>
        <DashboardDetails dashboard={dashboard} />
      </SidesheetCard>
      <DashboardEntityIdCard dashboard={dashboard} />
    </Stack>
  );
};

const HistoryTab = ({
  canWrite,
  revisions,
  currentUser,
  moderationReviews,
}: {
  canWrite: boolean;
  revisions?: Revision[];
  currentUser: User | null;
  moderationReviews: ModerationReview[];
}) => {
  const dispatch = useDispatch();

  const events = useMemo(() => {
    const moderationEvents = PLUGIN_MODERATION.getModerationTimelineEvents(
      moderationReviews,
      currentUser,
    );
    const revisionEvents = getTimelineEvents({ revisions, currentUser });

    return [...revisionEvents, ...moderationEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [moderationReviews, revisions, currentUser]);

  return (
    <SidesheetCard>
      <Timeline
        events={events}
        data-testid="dashboard-history-list"
        revert={revision => dispatch(revertToRevision(revision))}
        canWrite={canWrite}
      />
    </SidesheetCard>
  );
};
