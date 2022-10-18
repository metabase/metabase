import React, { useCallback, useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";
import type { Location } from "history";

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
  revisions: RevisionType[];
  currentUser: User;
  location?: Location;
  params?: Record<string, string>;
  setDashboardAttribute: (name: string, value: string | number | null) => void;
  saveDashboardAndCards: (
    id: number,
    routerOpts: { location?: Location; params?: Record<string, string> },
  ) => void;
  revertToRevision: (revision: RevisionType) => void;
}

const DashboardInfoSidebar = ({
  dashboard,
  revisions,
  currentUser,
  location,
  params,
  setDashboardAttribute,
  saveDashboardAndCards,
  revertToRevision,
}: DashboardInfoSidebarProps) => {
  const canWrite = dashboard.can_write;

  const showCaching =
    PLUGIN_CACHING.isEnabled() && MetabaseSettings.get("enable-query-caching");

  const handleDescriptionChange = useCallback(
    async (description: string) => {
      await setDashboardAttribute("description", description);
      saveDashboardAndCards(dashboard.id, { location, params });
    },
    [setDashboardAttribute, saveDashboardAndCards, dashboard, location, params],
  );

  const handleUpdateCacheTTL = async (cache_ttl: number | null) => {
    await setDashboardAttribute("cache_ttl", cache_ttl);
    saveDashboardAndCards(dashboard.id, { location, params });
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
    <DashboardInfoSidebarRoot data-testid="sidebar-right">
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
