import React from "react";

import { isImplicitActionButton } from "metabase/writeback/utils";

import type { ActionButtonDashboardCard, Dashboard } from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";

import DefaultActionButton from "./DefaultActionButton";
import ImplicitActionButton from "./ImplicitActionButton";

interface ActionButtonProps extends VisualizationProps {
  dashcard: ActionButtonDashboardCard;
  dashboard: Dashboard;
}

function ActionButton({ dashcard, ...props }: ActionButtonProps) {
  if (isImplicitActionButton(dashcard)) {
    return <ImplicitActionButton {...props} />;
  }
  return <DefaultActionButton {...props} />;
}

export default ActionButton;
