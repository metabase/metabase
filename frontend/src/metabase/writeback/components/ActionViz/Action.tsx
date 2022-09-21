import React from "react";

import { isImplicitActionButton } from "metabase/writeback/utils";

import type { ActionDashboardCard, Dashboard } from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";

import DefaultActionButton from "./DefaultActionButton";
import ImplicitActionButton from "./ImplicitActionButton";

interface ActionProps extends VisualizationProps {
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
}

function Action({ dashcard, ...props }: ActionProps) {
  if (isImplicitActionButton(dashcard)) {
    return <ImplicitActionButton {...props} />;
  }
  return <DefaultActionButton {...props} />;
}

export default Action;
