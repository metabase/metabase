import cx from "classnames";

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
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { FilterApplyButton } from "metabase/parameters/components/FilterApplyButton";
import { getVisibleParameters } from "metabase/parameters/utils/ui";

import {
  FixedWidthContainer,
  ParametersFixedWidthContainer,
  ParametersWidgetContainer,
} from "../Dashboard/Dashboard.styled";
import { DashboardParameterList } from "../DashboardParameterList";

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

  const allowSticky = isParametersWidgetContainersSticky(
    visibleParameters.length,
  );
  const {
    isSticky,
    isStickyStateChanging,
    intersectionObserverTargetRef: stickyRef,
  } = useIsParameterPanelSticky();

  const shouldApplyThemeChangeTransition = !isStickyStateChanging && isSticky;

  if (!hasVisibleParameters) {
    return null;
  }

  if (isEditing) {
    return (
      <span ref={stickyRef}>
        <ParametersWidgetContainer
          allowSticky
          isSticky
          isNightMode={shouldRenderAsNightMode}
          data-testid="edit-dashboard-parameters-widget-container"
        >
          <FixedWidthContainer
            isFixedWidth={dashboard?.width === "fixed"}
            data-testid="fixed-width-filters"
          >
            <DashboardParameterList isFullscreen={isFullscreen} />
          </FixedWidthContainer>
        </ParametersWidgetContainer>
      </span>
    );
  }

  return (
    <span ref={stickyRef}>
      <ParametersWidgetContainer
        className={cx({
          [TransitionS.transitionThemeChange]: shouldApplyThemeChangeTransition,
        })}
        allowSticky={allowSticky}
        isSticky={isSticky}
        isNightMode={shouldRenderAsNightMode}
        data-testid="dashboard-parameters-widget-container"
      >
        <ParametersFixedWidthContainer
          id={DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID}
          isFixedWidth={dashboard?.width === "fixed"}
          data-testid="fixed-width-filters"
        >
          <DashboardParameterList isFullscreen={isFullscreen} />

          <FilterApplyButton />
        </ParametersFixedWidthContainer>
      </ParametersWidgetContainer>
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
