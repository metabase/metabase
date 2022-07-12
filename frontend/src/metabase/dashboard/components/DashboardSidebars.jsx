import React, { useCallback } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";

import ClickBehaviorSidebar from "./ClickBehaviorSidebar";
import DashboardInfoSidebar from "./DashboardInfoSidebar";
import ParameterSidebar from "metabase/parameters/components/ParameterSidebar";
import SharingSidebar from "metabase/sharing/components/SharingSidebar";
import { AddCardSidebar } from "./add-card-sidebar/AddCardSidebar";

import * as MetabaseAnalytics from "metabase/lib/analytics";

DashboardSidebars.propTypes = {
  dashboard: PropTypes.object,
  parameters: PropTypes.array,
  showAddParameterPopover: PropTypes.func.isRequired,
  removeParameter: PropTypes.func.isRequired,
  addCardToDashboard: PropTypes.func.isRequired,
  editingParameter: PropTypes.object,
  isEditingParameter: PropTypes.bool.isRequired,
  showAddQuestionSidebar: PropTypes.bool.isRequired,
  clickBehaviorSidebarDashcard: PropTypes.object, // only defined when click-behavior sidebar is open
  onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,
  onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
  onUpdateDashCardColumnSettings: PropTypes.func.isRequired,
  setEditingParameter: PropTypes.func.isRequired,
  setParameter: PropTypes.func.isRequired,
  setParameterName: PropTypes.func.isRequired,
  setParameterDefaultValue: PropTypes.func.isRequired,
  dashcardData: PropTypes.object,
  setParameterFilteringParameters: PropTypes.func.isRequired,
  isSharing: PropTypes.bool.isRequired,
  isEditing: PropTypes.bool.isRequired,
  isFullscreen: PropTypes.bool.isRequired,
  onCancel: PropTypes.func.isRequired,
  params: PropTypes.object,
  sidebar: PropTypes.shape({
    name: PropTypes.string,
    props: PropTypes.object,
  }).isRequired,
  closeSidebar: PropTypes.func.isRequired,
  setDashboardAttribute: PropTypes.func,
  saveDashboardAndCards: PropTypes.func,
};

export function DashboardSidebars({
  dashboard,
  parameters,
  showAddParameterPopover,
  removeParameter,
  addCardToDashboard,
  editingParameter,
  isEditingParameter,
  showAddQuestionSidebar,
  clickBehaviorSidebarDashcard,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  setEditingParameter,
  setParameter,
  setParameterName,
  setParameterDefaultValue,
  dashcardData,
  setParameterFilteringParameters,
  isSharing,
  isEditing,
  isFullscreen,
  onCancel,
  params,
  sidebar,
  closeSidebar,
  setDashboardAttribute,
  saveDashboardAndCards,
}) {
  const handleAddCard = useCallback(
    cardId => {
      addCardToDashboard({
        dashId: dashboard.id,
        cardId: cardId,
      });
      MetabaseAnalytics.trackStructEvent("Dashboard", "Add Card");
    },
    [addCardToDashboard, dashboard.id],
  );

  if (isFullscreen) {
    return null;
  }

  switch (sidebar.name) {
    case SIDEBAR_NAME.addQuestion:
      return (
        <AddCardSidebar
          initialCollection={dashboard.collection_id}
          onSelect={handleAddCard}
        />
      );
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
          parameter={parameter}
          otherParameters={otherParameters}
          remove={() => {
            closeSidebar();
            removeParameter(editingParameterId);
          }}
          done={() => closeSidebar()}
          showAddParameterPopover={showAddParameterPopover}
          setParameter={setParameter}
          setName={name => setParameterName(editingParameterId, name)}
          setDefaultValue={value =>
            setParameterDefaultValue(editingParameterId, value)
          }
          setFilteringParameters={ids =>
            setParameterFilteringParameters(editingParameterId, ids)
          }
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
        <aside data-testid="sidebar-right">
          <DashboardInfoSidebar
            dashboard={dashboard}
            saveDashboardAndCards={saveDashboardAndCards}
            setDashboardAttribute={setDashboardAttribute}
          />
        </aside>
      );
    default:
      return null;
  }
}
