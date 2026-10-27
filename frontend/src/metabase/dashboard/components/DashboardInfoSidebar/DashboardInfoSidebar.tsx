import { useHotkeys } from "@mantine/hooks";
import type { FocusEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { skipToken, useListRevisionsQuery } from "metabase/api";
import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import {
  SIDEBAR_WIDTH,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EntityIdFooter } from "metabase/common/components/EntityIdFooter";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getActivityTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import { InsightsAction } from "metabase/common/components/upsells/components/InsightsAction";
import { DASHBOARD_DESCRIPTION_MAX_LENGTH } from "metabase/common/utils/dashboard";
import { getUser } from "metabase/current-user";
import { revertToRevision, updateDashboard } from "metabase/dashboard/actions";
import {
  type DashboardContextReturned,
  useDashboardContext,
} from "metabase/dashboard/context";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Stack, Text } from "metabase/ui";
import { isWithinIframe } from "metabase/utils/iframe";
import type {
  Dashboard,
  ModerationReview,
  Revision,
  User,
} from "metabase-types/api";

import { DashboardDetails } from "./DashboardDetails";

export function DashboardInfoSidebar() {
  const { dashboard, closeSidebar, setDashboardAttributes } =
    useDashboardContext();

  if (!dashboard) {
    return null;
  }

  return (
    <DashboardInfoSidebarInner
      dashboard={dashboard}
      closeSidebar={closeSidebar}
      setDashboardAttributes={setDashboardAttributes}
    />
  );
}

export function DashboardInfoSidebarInner({
  dashboard,
  closeSidebar,
  setDashboardAttributes,
}: { dashboard: NonNullable<DashboardContextReturned["dashboard"]> } & Pick<
  DashboardContextReturned,
  "closeSidebar" | "setDashboardAttributes"
>) {
  const [isOpen, setIsOpen] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  useHotkeys([["]", closeSidebar]]);

  useMount(() => {
    // this component is not rendered until it is "open"
    // but we want to set isOpen after it mounts to get
    // pretty animations
    setIsOpen(true);
  });

  const { data: revisions } = useListRevisionsQuery(
    dashboard ? { id: dashboard.id, entity: "dashboard" } : skipToken,
  );

  const isIADashboard = useMemo(
    () =>
      dashboard?.collection &&
      isInstanceAnalyticsCollection(dashboard?.collection),
    [dashboard?.collection],
  );

  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const handleDescriptionChange = useCallback(
    (description: string) => {
      if (
        dashboard?.id &&
        description.length <= DASHBOARD_DESCRIPTION_MAX_LENGTH
      ) {
        setDashboardAttributes?.({
          id: dashboard.id,
          attributes: { description },
        });
        dispatch(updateDashboard({ attributeNames: ["description"] }));
      }
    },
    [dashboard?.id, dispatch, setDashboardAttributes],
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

  if (!dashboard) {
    return null;
  }

  const canWrite = dashboard.can_write && !dashboard.archived;
  const entityIdItems = [
    { label: t`This dashboard`, entityId: dashboard.entity_id },
    ...(dashboard.tabs ?? []).flatMap(({ name, entity_id }) =>
      entity_id ? [{ label: name, entityId: entity_id }] : [],
    ),
  ];

  return (
    <div data-testid="sidebar-right">
      <ErrorBoundary>
        <Sidesheet
          isOpen={isOpen}
          title={
            <Box component="span" fz="h3" lh="h3">
              {t`Info`}
            </Box>
          }
          onClose={closeSidebar}
          size={SIDEBAR_WIDTH}
          actions={<InsightsAction dashboard={dashboard} model="dashboard" />}
          footer={
            isWithinIframe() ? undefined : (
              <EntityIdFooter items={entityIdItems} />
            )
          }
        >
          <Stack gap="xxl">
            <Overview
              dashboard={dashboard}
              handleDescriptionChange={handleDescriptionChange}
              handleDescriptionBlur={handleDescriptionBlur}
              descriptionError={descriptionError}
              setDescriptionError={setDescriptionError}
              canWrite={canWrite}
            />
            {!isIADashboard && (
              <SidebarSection title={t`History`}>
                <History
                  dashboard={dashboard}
                  canWrite={canWrite}
                  revisions={revisions}
                  currentUser={currentUser}
                  moderationReviews={dashboard.moderation_reviews}
                />
              </SidebarSection>
            )}
          </Stack>
        </Sidesheet>
      </ErrorBoundary>
    </div>
  );
}

const Overview = ({
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
    <Stack gap="xxl">
      <SidebarSection title={t`Description`} gap={0}>
        <Stack gap="sm">
          <SidesheetEditableDescription
            description={dashboard.description}
            onChange={handleDescriptionChange}
            canWrite={canWrite}
            onFocus={() => setDescriptionError("")}
            onBlur={handleDescriptionBlur}
          />
          {!!descriptionError && (
            <Text color="feedback-negative" size="xs">
              {descriptionError}
            </Text>
          )}
          <PLUGIN_MODERATION.ModerationReviewTextForDashboard
            dashboard={dashboard}
          />
        </Stack>
      </SidebarSection>
      <DashboardDetails dashboard={dashboard} />
    </Stack>
  );
};

const History = ({
  dashboard,
  canWrite,
  revisions,
  currentUser,
  moderationReviews,
}: {
  dashboard: Dashboard;
  canWrite: boolean;
  revisions?: Revision[];
  currentUser: User | null;
  moderationReviews: ModerationReview[];
}) => {
  const dispatch = useDispatch();

  const events = useMemo(
    () =>
      getActivityTimelineEvents({ revisions, moderationReviews, currentUser }),
    [moderationReviews, revisions, currentUser],
  );

  return (
    <Box bd="1px solid var(--mb-color-border-neutral)" bdrs="lg" p="sm">
      <RevisionHistoryTimeline
        events={events}
        data-testid="dashboard-history-list"
        revert={(revision) =>
          dispatch(revertToRevision(dashboard.id, revision))
        }
        canWrite={canWrite}
        entity="dashboard"
      />
    </Box>
  );
};
