import type { FocusEvent } from "react";
import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { c, t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  Sidesheet,
  SidesheetCard,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import SidesheetS from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useDocsUrl, useRevisionListQuery } from "metabase/common/hooks";
import { CopyButton } from "metabase/components/CopyButton";
import DateTime from "metabase/components/DateTime";
import { formatEditorName } from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import Link from "metabase/core/components/Link";
import { revertToRevision, updateDashboard } from "metabase/dashboard/actions";
import { DASHBOARD_DESCRIPTION_MAX_LENGTH } from "metabase/dashboard/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import {
  Flex,
  Group,
  Icon,
  Paper,
  Popover,
  Stack,
  Tabs,
  Text,
} from "metabase/ui";
import type { Dashboard, Revision, User } from "metabase-types/api";

import DashboardInfoSidebarS from "./DashboardInfoSidebar.module.css";
import { EditableDescription } from "./DashboardInfoSidebar.styled";

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

  return (
    <div data-testid="sidebar-right">
      <ErrorBoundary>
        <Sidesheet
          isOpen={isOpen}
          title={<Flex px="sm">{t`Info`}</Flex>}
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
}: {
  dashboard: Dashboard;
  handleDescriptionChange: (description: string) => void;
  handleDescriptionBlur: (event: FocusEvent<HTMLTextAreaElement>) => void;
  descriptionError: string | null;
  setDescriptionError: (error: string | null) => void;
  canWrite: boolean;
}) => {
  const lastEditDate = dashboard.updated_at;
  const lastEditor = formatEditorName(dashboard["last-edit-info"]);

  const { url: serializationDocsUrl, showMetabaseLinks } = useDocsUrl(
    "installation-and-operation/serialization",
  );

  return (
    <Stack spacing="lg">
      <SidesheetCard title={t`Description`} pb="md">
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
          className={DashboardInfoSidebarS.EditableDescription}
        />
        {!!descriptionError && (
          <Text color="error" size="xs" mt="xs">
            {descriptionError}
          </Text>
        )}
      </SidesheetCard>
      <SidesheetCard title={t`Last edit`}>
        <Flex lh="1" align="center" gap=".25rem">
          <Icon name="pencil" />
          {c(
            "This phrase describes the last time a dashboard was edited. {0} is the date. {1} is the name of the editor.",
          ).jt`${(
            <DateTime unit="day" value={lastEditDate} />
          )} by ${lastEditor}`}
        </Flex>
      </SidesheetCard>
      {dashboard.entity_id && (
        <SidesheetCard
          title={
            <Group spacing="sm">
              {t`Entity ID`}
              <Popover position="top">
                <Popover.Target>
                  <Icon
                    name="info"
                    className={DashboardInfoSidebarS.EntityIdInfoIcon}
                  />
                </Popover.Target>
                <Popover.Dropdown>
                  <Paper p="md" maw="12.5rem">
                    {c(
                      "The phrase 'global entity ID' refers to the global ID of the entity (not the ID of a global entity)",
                    )
                      .t`When using serialization, replace the sequential ID with this global entity ID to have stable URLs across environments. Also useful when troubleshooting serialization.`}{" "}
                    {showMetabaseLinks && (
                      <>
                        <Link
                          target="_new"
                          to={serializationDocsUrl}
                          style={{ color: "var(--mb-color-brand)" }}
                        >
                          Learn more
                        </Link>
                        .
                      </>
                    )}
                  </Paper>
                </Popover.Dropdown>
              </Popover>
            </Group>
          }
        >
          <Group spacing="md">
            {dashboard.entity_id}
            <CopyButton
              value={dashboard.entity_id}
              style={{ cursor: "pointer" }}
            />
          </Group>
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
        className={DashboardInfoSidebarS.DashboardHistory}
      />
    </SidesheetCard>
  );
};
