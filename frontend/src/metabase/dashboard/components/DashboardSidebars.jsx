/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import ClickBehaviorSidebar from "./ClickBehaviorSidebar";
import ParameterSidebar from "metabase/parameters/components/ParameterSidebar";
import SharingSidebar from "metabase/sharing/components/SharingSidebar";
import { AddCardSidebar } from "./add-card-sidebar/AddCardSidebar";

import MetabaseAnalytics from "metabase/lib/analytics";

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

  // SharingSidebar should only show if we're not editing or in fullscreen
  if (!isEditing && !isFullscreen && isSharing) {
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
