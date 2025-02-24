import cx from "classnames";
import { useRef } from "react";

import TransitionS from "metabase/css/core/transitions.module.css";
import { DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/dashboard/constants";
import { useIsParameterPanelSticky } from "metabase/dashboard/hooks/use-is-parameter-panel-sticky";
import {
  getDashboardComplete,
  getIsEditing,
  getIsNightMode,
  getParameters,
  getTabHiddenParameterSlugs,
} from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/env";
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

import DashboardS from "../Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "../Dashboard/DashboardComponents";
import { DashboardParameterList } from "../DashboardParameterList";

import S from "./DashboardParameterPanel.module.css";

interface DashboardParameterPanelProps {
  isFullscreen: boolean;
}

export function DashboardParameterPanel({
  isFullscreen,
}: DashboardParameterPanelProps) {
  const dashboard = useSelector(getDashboardComplete);
  const parameters = useSelector(getParameters);
  const hiddenParameterSlugs = useSelector(getTabHiddenParameterSlugs);
  const isEditing = useSelector(getIsEditing);
  const isNightMode = useSelector(getIsNightMode);
  const visibleParameters = getVisibleParameters(
    parameters,
    hiddenParameterSlugs,
  );
  const hasVisibleParameters = visibleParameters.length > 0;
  const shouldRenderAsNightMode = isNightMode && isFullscreen;

  const parameterPanelRef = useRef<HTMLElement>(null);
  const allowSticky = isParametersWidgetContainersSticky(
    visibleParameters.length,
  );
  const { isSticky, isStickyStateChanging } = useIsParameterPanelSticky({
    parameterPanelRef,
  });

  const shouldApplyThemeChangeTransition = !isStickyStateChanging && isSticky;

  if (!hasVisibleParameters) {
    return null;
  }

  if (isEditing) {
    return (
      <span ref={parameterPanelRef}>
        <FullWidthContainer
          className={cx(
            S.ParametersWidgetContainer,
            S.allowSticky,
            S.isSticky,
            {
              [S.isNightMode]: shouldRenderAsNightMode,
              [S.isEmbeddingSdk]: isEmbeddingSdk,
            },
          )}
          data-testid="edit-dashboard-parameters-widget-container"
        >
          <FixedWidthContainer
            isFixedWidth={dashboard?.width === "fixed"}
            data-testid="fixed-width-filters"
          >
            <DashboardParameterList isFullscreen={isFullscreen} />
          </FixedWidthContainer>
        </FullWidthContainer>
      </span>
    );
  }

  return (
    <span ref={parameterPanelRef}>
      <FullWidthContainer
        className={cx(S.ParametersWidgetContainer, {
          [TransitionS.transitionThemeChange]: shouldApplyThemeChangeTransition,
          [S.allowSticky]: allowSticky,
          [S.isSticky]: isSticky,
          [S.isNightMode]: shouldRenderAsNightMode,
          [S.isEmbeddingSdk]: isEmbeddingSdk,
        })}
        data-testid="dashboard-parameters-widget-container"
      >
        <FixedWidthContainer
          className={DashboardS.ParametersFixedWidthContainer}
          id={DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID}
          isFixedWidth={dashboard?.width === "fixed"}
          data-testid="fixed-width-filters"
        >
          <DashboardParameterList isFullscreen={isFullscreen} />

          <FilterApplyButton />
        </FixedWidthContainer>
      </FullWidthContainer>
    </span>
  );
}

function isParametersWidgetContainersSticky(parameterCount: number) {
  if (!isSmallScreen()) {
    return true;
  }

  // Sticky header with more than 5 parameters
  // takes too much space on small screens
  return parameterCount <= 5;
}
