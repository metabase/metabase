import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import ClickBehaviorSidebar from "./ClickBehaviorSidebar";
import ParameterSidebar from "metabase/parameters/components/ParameterSidebar";
import SharingSidebar from "metabase/sharing/components/SharingSidebar";
import { AddCardSidebar } from "./add-card-sidebar/AddCardSidebar";

import MetabaseAnalytics from "metabase/lib/analytics";

DashboardSidebars.propTypes = {
  dashboard: PropTypes.object,
  parameters: PropTypes.array,
  showAddParameterPopover: PropTypes.func.isRequired,
  removeParameter: PropTypes.func.isRequired,
  addCardToDashboard: PropTypes.func.isRequired,
  editingParameter: PropTypes.object,
  isEditingParameter: PropTypes.bool.isRequired,
  showAddQuestionSidebar: PropTypes.bool.isRequired,
  clickBehaviorSidebarDashcard: PropTypes.object.isRequired,
  onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,
  onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
  onUpdateDashCardColumnSettings: PropTypes.func.isRequired,
  hideClickBehaviorSidebar: PropTypes.func.isRequired,
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
  hideClickBehaviorSidebar,
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
}) {
  const handleAddCard = cardId => {
    addCardToDashboard({
      dashId: dashboard.id,
      cardId: cardId,
    });
    MetabaseAnalytics.trackEvent("Dashboard", "Add Card");
  };

  if (showAddQuestionSidebar) {
    return (
      <AddCardSidebar
        initialCollection={dashboard.collection_id}
        onSelect={handleAddCard}
      />
    );
  }

  if (clickBehaviorSidebarDashcard) {
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
        hideClickBehaviorSidebar={hideClickBehaviorSidebar}
        onReplaceAllDashCardVisualizationSettings={
          onReplaceAllDashCardVisualizationSettings
        }
      />
    );
  }

  if (isEditingParameter) {
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
          setEditingParameter(null);
          removeParameter(editingParameterId);
        }}
        done={() => setEditingParameter(null)}
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

  const shouldShowSidebar = !isEditing && !isFullscreen && isSharing;
  if (shouldShowSidebar) {
    return (
      <SharingSidebar
        dashboard={dashboard}
        params={params}
        onCancel={onCancel}
      />
    );
  }

  return null;
}
