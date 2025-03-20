import cx from "classnames";
import type { ReactNode } from "react";
import type { ConnectedProps } from "react-redux";
import type { Route, WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import {
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addLinkDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addParameter,
  cancelFetchDashboardCardData,
  closeSidebar,
  fetchDashboard,
  fetchDashboardCardData,
  hideAddParameterPopover,
  initialize,
  navigateToNewCardFromDashboard,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  onUpdateDashCardVisualizationSettings,
  removeParameter,
  setDashboardAttributes,
  setEditingDashboard,
  setParameterDefaultValue,
  setParameterFilteringParameters,
  setParameterIsMultiSelect,
  setParameterName,
  setParameterQueryType,
  setParameterRequired,
  setParameterSourceConfig,
  setParameterSourceType,
  setParameterTemporalUnits,
  setParameterType,
  setSharing,
  setSidebar,
  showAddParameterPopover,
  toggleSidebar,
  updateDashboardAndCards,
} from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { useFavicon } from "metabase/hooks/use-favicon";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";
import type { DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { DashboardContextProvider } from "../../context";
import {
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getFavicon,
  getIsAddParameterPopoverOpen,
  getIsAdditionalInfoVisible,
  getIsDashCardsLoadingComplete,
  getIsDashCardsRunning,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsNavigatingBackToDashboard,
  getIsSharing,
  getLoadingStartTime,
  getParameterValues,
  getSelectedTabId,
  getSidebar,
  getSlowCards,
} from "../../selectors";

type OwnProps = {
  dashboardId?: DashboardId;
  route: Route;
  params: { slug: string };
  children?: ReactNode;
};

const mapStateToProps = (state: State) => {
  return {
    canManageSubscriptions: canManageSubscriptions(state),
    isAdmin: getUserIsAdmin(state),
    isNavbarOpen: getIsNavbarOpen(state),
    isEditing: getIsEditing(state),
    isSharing: getIsSharing(state),
    dashboardBeforeEditing: getDashboardBeforeEditing(state),
    isEditingParameter: getIsEditingParameter(state),
    isDirty: getIsDirty(state),
    dashboard: getDashboardComplete(state),
    slowCards: getSlowCards(state),
    parameterValues: getParameterValues(state),
    loadingStartTime: getLoadingStartTime(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
    isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
    sidebar: getSidebar(state),
    pageFavicon: getFavicon(state),
    documentTitle: getDocumentTitle(state),
    isRunning: getIsDashCardsRunning(state),
    isLoadingComplete: getIsDashCardsLoadingComplete(state),
    isHeaderVisible: getIsHeaderVisible(state),
    isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),
    selectedTabId: getSelectedTabId(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  initialize,
  cancelFetchDashboardCardData,
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addLinkDashCardToDashboard,
  setEditingDashboard,
  setDashboardAttributes,
  setSharing,
  toggleSidebar,
  closeSidebar,
  closeNavbar,
  setErrorPage,
  setParameterName,
  setParameterType,
  navigateToNewCardFromDashboard,
  setParameterDefaultValue,
  setParameterRequired,
  setParameterTemporalUnits,
  setParameterIsMultiSelect,
  setParameterQueryType,
  setParameterSourceType,
  setParameterSourceConfig,
  setParameterFilteringParameters,
  showAddParameterPopover,
  removeParameter,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  updateDashboardAndCards,
  setSidebar,
  hideAddParameterPopover,
  fetchDashboard,
  fetchDashboardCardData,
  onChangeLocation: push,
  addParameter,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;

export type DashboardAppProps = OwnProps & ReduxProps & WithRouterProps;

function getDashboardId({ dashboardId, params }: DashboardAppProps) {
  if (dashboardId) {
    return dashboardId;
  }

  return Urls.extractEntityId(params.slug) as DashboardId;
}

const DashboardApp = (props: DashboardAppProps) => {
  useFavicon({ favicon: props.pageFavicon });
  useDashboardUrlQuery(props.router, props.location);

  const {
    dashboard,
    isEditing,
    isDirty,
    route,
    location,
    parameterValues,
    selectedTabId,
    isNavigatingBackToDashboard,
    isAdmin,
    canManageSubscriptions,
    isNavbarOpen,
    isSharing,
    dashboardBeforeEditing,
    isEditingParameter,
    slowCards,
    loadingStartTime,
    clickBehaviorSidebarDashcard,
    isAddParameterPopoverOpen,
    sidebar,
    isHeaderVisible,
    isAdditionalInfoVisible,
    initialize,
    cancelFetchDashboardCardData,
    addCardToDashboard,
    addHeadingDashCardToDashboard,
    addMarkdownDashCardToDashboard,
    addLinkDashCardToDashboard,
    setEditingDashboard,
    setDashboardAttributes,
    setSharing,
    toggleSidebar,
    closeSidebar,
    closeNavbar,
    setErrorPage,
    setParameterName,
    setParameterType,
    navigateToNewCardFromDashboard,
    setParameterDefaultValue,
    setParameterRequired,
    setParameterTemporalUnits,
    setParameterIsMultiSelect,
    setParameterQueryType,
    setParameterSourceType,
    setParameterSourceConfig,
    setParameterFilteringParameters,
    showAddParameterPopover,
    removeParameter,
    onReplaceAllDashCardVisualizationSettings,
    onUpdateDashCardVisualizationSettings,
    onUpdateDashCardColumnSettings,
    updateDashboardAndCards,
    setSidebar,
    hideAddParameterPopover,
    fetchDashboard,
    fetchDashboardCardData,
    isLoadingComplete,
    isRunning,
    addParameter,
  } = props;

  const parameterQueryParams = location.query;
  const dashboardId = getDashboardId(props);

  return (
    <div className={cx(CS.shrinkBelowContentSize, CS.fullHeight)}>
      <DashboardLeaveConfirmationModal
        route={route}
        isDirty={isDirty}
        isEditing={isEditing}
      />
      <DashboardContextProvider
        dashboardId={dashboardId}
        isEditing={isEditing}
        isSharing={isSharing}
        isRunning={isRunning}
        isLoadingComplete={isLoadingComplete}
        dashboardBeforeEditing={dashboardBeforeEditing}
        isEditingParameter={isEditingParameter}
        isDirty={isDirty}
        dashboard={dashboard}
        slowCards={slowCards}
        parameterValues={parameterValues}
        loadingStartTime={loadingStartTime}
        clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
        isAddParameterPopoverOpen={isAddParameterPopoverOpen}
        sidebar={sidebar}
        isHeaderVisible={isHeaderVisible}
        isAdditionalInfoVisible={isAdditionalInfoVisible}
        selectedTabId={selectedTabId}
        isNavigatingBackToDashboard={isNavigatingBackToDashboard}
        canManageSubscriptions={canManageSubscriptions}
        isAdmin={isAdmin}
        isNavbarOpen={isNavbarOpen}
        location={location}
        parameterQueryParams={parameterQueryParams}
        initialize={initialize}
        cancelFetchDashboardCardData={cancelFetchDashboardCardData}
        addCardToDashboard={addCardToDashboard}
        addHeadingDashCardToDashboard={addHeadingDashCardToDashboard}
        addMarkdownDashCardToDashboard={addMarkdownDashCardToDashboard}
        addLinkDashCardToDashboard={addLinkDashCardToDashboard}
        setEditingDashboard={setEditingDashboard}
        setDashboardAttributes={setDashboardAttributes}
        setSharing={setSharing}
        toggleSidebar={toggleSidebar}
        closeSidebar={closeSidebar}
        closeNavbar={closeNavbar}
        setErrorPage={setErrorPage}
        setParameterName={setParameterName}
        setParameterType={setParameterType}
        navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
        setParameterDefaultValue={setParameterDefaultValue}
        setParameterRequired={setParameterRequired}
        setParameterTemporalUnits={setParameterTemporalUnits}
        setParameterIsMultiSelect={setParameterIsMultiSelect}
        setParameterQueryType={setParameterQueryType}
        setParameterSourceType={setParameterSourceType}
        setParameterSourceConfig={setParameterSourceConfig}
        setParameterFilteringParameters={setParameterFilteringParameters}
        showAddParameterPopover={showAddParameterPopover}
        removeParameter={removeParameter}
        onReplaceAllDashCardVisualizationSettings={
          onReplaceAllDashCardVisualizationSettings
        }
        onUpdateDashCardVisualizationSettings={
          onUpdateDashCardVisualizationSettings
        }
        onUpdateDashCardColumnSettings={onUpdateDashCardColumnSettings}
        updateDashboardAndCards={updateDashboardAndCards}
        setSidebar={setSidebar}
        hideAddParameterPopover={hideAddParameterPopover}
        fetchDashboard={fetchDashboard}
        fetchDashboardCardData={fetchDashboardCardData}
        addParameter={addParameter}
      >
        <Dashboard
          parameterQueryParams={parameterQueryParams}
          parameterValues={parameterValues}
        />
      </DashboardContextProvider>
      {props.children}
    </div>
  );
};

export const DashboardAppConnected = _.compose(
  connector,
  title(
    ({
      dashboard,
      documentTitle,
    }: Pick<ReduxProps, "dashboard" | "documentTitle">) => ({
      title: documentTitle || dashboard?.name,
      titleIndex: 1,
    }),
  ),
  titleWithLoadingTime("loadingStartTime"),
)(DashboardApp);
