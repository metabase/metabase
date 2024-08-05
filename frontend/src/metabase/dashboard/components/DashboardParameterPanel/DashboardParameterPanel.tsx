import {
  getDashboardComplete,
  getTabHiddenParameterSlugs,
  getIsEditing,
  getIsNightMode,
  getParameters,
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
  hasScroll: boolean;
  isFullscreen: boolean;
}

export function DashboardParameterPanel({
  hasScroll,
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

  if (!hasVisibleParameters) {
    return null;
  }

  if (isEditing) {
    return (
      <ParametersWidgetContainer
        hasScroll
        isSticky
        isFullscreen={isFullscreen}
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
    );
  }

  return (
    <ParametersWidgetContainer
      hasScroll={hasScroll}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      isSticky={isParametersWidgetContainersSticky(visibleParameters.length)}
      data-testid="dashboard-parameters-widget-container"
    >
      <ParametersFixedWidthContainer
        isFixedWidth={dashboard?.width === "fixed"}
        data-testid="fixed-width-filters"
      >
        <DashboardParameterList isFullscreen={isFullscreen} />

        <FilterApplyButton />
      </ParametersFixedWidthContainer>
    </ParametersWidgetContainer>
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
