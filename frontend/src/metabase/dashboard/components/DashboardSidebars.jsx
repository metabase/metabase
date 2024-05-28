import PropTypes from "prop-types";
import { useCallback } from "react";
import _ from "underscore";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  getEditingParameter,
  getParameters,
} from "metabase/dashboard/selectors";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { useSelector } from "metabase/lib/redux";
import { ParameterSidebar } from "metabase/parameters/components/ParameterSidebar";
import { hasMapping } from "metabase/parameters/utils/dashboards";
import SharingSidebar from "metabase/sharing/components/SharingSidebar";

import { ActionSidebarConnected } from "./ActionSidebar";
import { AddCardSidebar } from "./AddCardSidebar";
import { ClickBehaviorSidebar } from "./ClickBehaviorSidebar/ClickBehaviorSidebar";
import { DashboardInfoSidebar } from "./DashboardInfoSidebar";

DashboardSidebars.propTypes = {
  dashboard: PropTypes.object,
  showAddParameterPopover: PropTypes.func.isRequired,
  removeParameter: PropTypes.func.isRequired,
  addCardToDashboard: PropTypes.func.isRequired,
  clickBehaviorSidebarDashcard: PropTypes.object, // only defined when click-behavior sidebar is open
  onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,
  onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
  onUpdateDashCardColumnSettings: PropTypes.func.isRequired,
  setParameterName: PropTypes.func.isRequired,
  setParameterType: PropTypes.func.isRequired,
  setParameterDefaultValue: PropTypes.func.isRequired,
  setParameterIsMultiSelect: PropTypes.func.isRequired,
  setParameterQueryType: PropTypes.func.isRequired,
  setParameterSourceType: PropTypes.func.isRequired,
  setParameterSourceConfig: PropTypes.func.isRequired,
  setParameterFilteringParameters: PropTypes.func.isRequired,
  setParameterRequired: PropTypes.func.isRequired,
  dashcardData: PropTypes.object,
  isFullscreen: PropTypes.bool.isRequired,
  onCancel: PropTypes.func.isRequired,
  params: PropTypes.object,
  sidebar: PropTypes.shape({
    name: PropTypes.string,
    props: PropTypes.object,
  }).isRequired,
  closeSidebar: PropTypes.func.isRequired,
  setDashboardAttribute: PropTypes.func,
  selectedTabId: PropTypes.number,
  getEmbeddedParameterVisibility: PropTypes.func.isRequired,
};

export function DashboardSidebars({
  dashboard,
  showAddParameterPopover,
  removeParameter,
  addCardToDashboard,
  clickBehaviorSidebarDashcard,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  setParameterName,
  setParameterType,
  setParameterDefaultValue,
  setParameterIsMultiSelect,
  setParameterQueryType,
  setParameterSourceType,
  setParameterSourceConfig,
  setParameterFilteringParameters,
  setParameterRequired,
  dashcardData,
  isFullscreen,
  onCancel,
  params,
  sidebar,
  closeSidebar,
  setDashboardAttribute,
  selectedTabId,
  getEmbeddedParameterVisibility,
}) {
  const parameters = useSelector(getParameters);
  const editingParameter = useSelector(getEditingParameter);

  const handleAddCard = useCallback(
    cardId => {
      addCardToDashboard({
        dashId: dashboard.id,
        cardId: cardId,
        tabId: selectedTabId,
      });
      MetabaseAnalytics.trackStructEvent("Dashboard", "Add Card");
    },
    [addCardToDashboard, dashboard.id, selectedTabId],
  );

  if (isFullscreen) {
    return null;
  }

  switch (sidebar.name) {
    case SIDEBAR_NAME.addQuestion:
      return <AddCardSidebar onSelect={handleAddCard} onClose={closeSidebar} />;
    case SIDEBAR_NAME.action: {
      const onUpdateVisualizationSettings = settings =>
        onUpdateDashCardVisualizationSettings(
          sidebar.props.dashcardId,
          settings,
        );

      return (
        <ActionSidebarConnected
          dashboard={dashboard}
          dashcardId={sidebar.props.dashcardId}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
          onClose={closeSidebar}
        />
      );
    }
    case SIDEBAR_NAME.clickBehavior:
      return (
        <ClickBehaviorSidebar
          dashboard={dashboard}
          dashcard={clickBehaviorSidebarDashcard}
          parameters={parameters}
          dashcardData={dashcardData[clickBehaviorSidebarDashcard.id]}
          onUpdateDashCardVisualizationSettings={
            onUpdateDashCardVisualizationSettings
          }
          onUpdateDashCardColumnSettings={onUpdateDashCardColumnSettings}
          hideClickBehaviorSidebar={closeSidebar}
          onReplaceAllDashCardVisualizationSettings={
            onReplaceAllDashCardVisualizationSettings
          }
        />
      );
    case SIDEBAR_NAME.editParameter: {
      const { id: editingParameterId } = editingParameter || {};
      const [[parameter], otherParameters] = _.partition(
        parameters,
        p => p.id === editingParameterId,
      );
      return (
        <ParameterSidebar
          getEmbeddedParameterVisibility={getEmbeddedParameterVisibility}
          parameter={parameter}
          otherParameters={otherParameters}
          onChangeName={setParameterName}
          onChangeType={setParameterType}
          onChangeDefaultValue={setParameterDefaultValue}
          onChangeIsMultiSelect={setParameterIsMultiSelect}
          onChangeQueryType={setParameterQueryType}
          onChangeSourceType={setParameterSourceType}
          onChangeSourceConfig={setParameterSourceConfig}
          onChangeFilteringParameters={setParameterFilteringParameters}
          onRemoveParameter={removeParameter}
          onShowAddParameterPopover={showAddParameterPopover}
          onClose={closeSidebar}
          onChangeRequired={setParameterRequired}
          hasMapping={hasMapping(parameter, dashboard)}
        />
      );
    }
    case SIDEBAR_NAME.sharing:
      return (
        <SharingSidebar
          dashboard={dashboard}
          params={params}
          onCancel={onCancel}
        />
      );
    case SIDEBAR_NAME.info:
      return (
        <DashboardInfoSidebar
          dashboard={dashboard}
          setDashboardAttribute={setDashboardAttribute}
        />
      );
    default:
      return null;
  }
}
