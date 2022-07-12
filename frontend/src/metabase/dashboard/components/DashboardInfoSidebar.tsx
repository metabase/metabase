import React, { useCallback, useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";

import { PLUGIN_CACHING } from "metabase/plugins";
import MetabaseSettings from "metabase/lib/settings";

import DefaultTimeline from "metabase/components/Timeline";
import EditableText from "metabase/core/components/EditableText";

import { Dashboard, Revision as RevisionType, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Revision from "metabase/entities/revisions";
import { getRevisionEventsForTimeline } from "metabase/lib/revisions";
import { getUser } from "metabase/selectors/user";

import { revertToRevision } from "metabase/dashboard/actions";

import {
  DashboardInfoSidebarRoot,
  HistoryHeader,
  ContentSection,
  DescriptionHeader,
} from "./DashboardInfoSidebar.styled";

interface DashboardInfoSidebarProps {
  dashboard: Dashboard;
  setDashboardAttribute: (name: string, value: string | number | null) => void;
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

  const showCaching =
    PLUGIN_CACHING.isEnabled() && MetabaseSettings.get("enable-query-caching");

  const handleDescriptionChange = useCallback(
    async (description: string) => {
      await setDashboardAttribute("description", description);
      saveDashboardAndCards(dashboard.id);
    },
    [setDashboardAttribute, saveDashboardAndCards, dashboard],
  );

  const handleUpdateCacheTTL = async (cache_ttl: number | null) => {
    await setDashboardAttribute("cache_ttl", cache_ttl);
    saveDashboardAndCards(dashboard.id);
  };

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
      <ContentSection>
        <DescriptionHeader>{t`About`}</DescriptionHeader>
        <EditableText
          initialValue={dashboard.description}
          isDisabled={!dashboard.can_write}
          onChange={handleDescriptionChange}
          isMultiline
          placeholder={t`Add description`}
          key={`dashboard-description-${dashboard.description}`}
        />
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
        <DefaultTimeline
          items={events}
          data-testid="dashboard-history-list"
          revertFn={revertToRevision}
        />
      </ContentSection>
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
