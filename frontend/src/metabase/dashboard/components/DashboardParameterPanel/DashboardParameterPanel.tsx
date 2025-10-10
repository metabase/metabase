import cx from "classnames";
import { useRef } from "react";

import TransitionS from "metabase/css/core/transitions.module.css";
import { DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import { useIsParameterPanelSticky } from "metabase/dashboard/hooks/use-is-parameter-panel-sticky";
import { getDashboardHeaderValuePopulatedParameters } from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

import { Dashboard } from "../Dashboard";
import DashboardS from "../Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "../Dashboard/DashboardComponents";

import S from "./DashboardParameterPanel.module.css";

export function DashboardParameterPanel() {
  const parameters = useSelector(getDashboardHeaderValuePopulatedParameters);

  const { dashboard, hideParameters, isEditing } = useDashboardContext();

  const visibleParameters = getVisibleParameters(parameters, hideParameters);
  const hasVisibleParameters = visibleParameters.length > 0;

  const parameterPanelRef = useRef<HTMLElement>(null);
  const allowSticky = isParametersWidgetContainersSticky(
    visibleParameters.length,
  );
  const { isSticky, isStickyStateChanging } = useIsParameterPanelSticky({
    parameterPanelRef,
    disabled: !allowSticky || !hasVisibleParameters,
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
              [S.isEmbeddingSdk]: isEmbeddingSdk(),
            },
          )}
          data-testid="edit-dashboard-parameters-widget-container"
        >
          <FixedWidthContainer
            isFixedWidth={dashboard?.width === "fixed"}
            data-testid="fixed-width-filters"
          >
            <Dashboard.ParametersList />
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
          [S.isEmbeddingSdk]: isEmbeddingSdk(),
        })}
        data-testid="dashboard-parameters-widget-container"
      >
        <FixedWidthContainer
          className={DashboardS.ParametersFixedWidthContainer}
          id={DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}
          isFixedWidth={dashboard?.width === "fixed"}
          data-testid="fixed-width-filters"
        >
          <Dashboard.ParametersList />
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
