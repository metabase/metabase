import React, { useCallback, useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";
import DefaultTimeline from "metabase/components/Timeline";

import { Dashboard, Revision as RevisionType, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Revision from "metabase/entities/revisions";
import { getRevisionEventsForTimeline } from "metabase/lib/revisions";
import { getUser } from "metabase/selectors/user";

import { revertToRevision } from "metabase/dashboard/actions";

import {
  DashboardInfoSidebarRoot,
  HistoryHeader,
  DashboardDescriptionEditbaleText,
} from "./DashboardInfoSidebar.styled";

interface DashboardInfoSidebarProps {
  dashboard: Dashboard;
  setDashboardAttribute: (name: string, value: string) => void;
  saveDashboardAndCards: (id: number) => void;
  revisions: RevisionType[];
  currentUser: User;
  revertToRevision: (revision: RevisionType) => void;
}

const DashboardInfoSidebar = ({
  dashboard,
  setDashboardAttribute,
  saveDashboardAndCards,
  revisions,
  currentUser,
  revertToRevision,
}: DashboardInfoSidebarProps) => {
  const canWrite = dashboard.can_write;

  const handleDescriptionChange = useCallback(
    async (description: string) => {
      await setDashboardAttribute("description", description);
      saveDashboardAndCards(dashboard.id);
    },
    [setDashboardAttribute, saveDashboardAndCards, dashboard],
  );

  const events = useMemo(
    () =>
      getRevisionEventsForTimeline(revisions, {
        currentUser,
        canWrite,
      }),
    [revisions, currentUser, canWrite],
  );

  return (
    <DashboardInfoSidebarRoot>
      <DashboardDescriptionEditbaleText
        initialValue={dashboard.description}
        isDisabled={!dashboard.can_write}
        onChange={handleDescriptionChange}
        isMultiline
        placeholder={t`Add a helpful description. You'll thank me later`}
        key={`dashboard-description-${dashboard.description}`}
      />

      <HistoryHeader>{t`History`}</HistoryHeader>
      <DefaultTimeline
        items={events}
        data-testid="dashboard-history-list"
        revertFn={revertToRevision}
      />
    </DashboardInfoSidebarRoot>
  );
};

const mapStateToProps = (state: State) => ({
  currentUser: getUser(state),
});

const mapDispatchToProps = {
  revertToRevision,
};

export default _.compose(
  Revision.loadList({
    query: (state: State, props: DashboardInfoSidebarProps) => ({
      model_type: "dashboard",
      model_id: props.dashboard.id,
    }),
    wrapped: true,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardInfoSidebar);
