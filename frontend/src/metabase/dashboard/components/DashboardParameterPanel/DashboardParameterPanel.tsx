import cx from "classnames";
import { useRef } from "react";

import { useDashboardContext } from "metabase/dashboard/context";
import { useIsParameterPanelSticky } from "metabase/dashboard/hooks/use-is-parameter-panel-sticky";
import { getDashboardHeaderValuePopulatedParameters } from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { useNavToggleInset } from "metabase/nav/prototype/use-nav-toggle-inset";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { useSelector } from "metabase/redux";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { isSmallScreen } from "metabase/utils/dom";
import { DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/visualizations/lib/save-dashboard-pdf";

import DashboardS from "../Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "../Dashboard/DashboardComponents";
import { ParametersList } from "../Dashboard/components";

import S from "./DashboardParameterPanel.module.css";
import { DashboardParameterPanelSkeleton } from "./DashboardParameterPanelSkeleton";

export function DashboardParameterPanel() {
  const parameters = useSelector(getDashboardHeaderValuePopulatedParameters);

  const { dashboard, dashboardId, hideParameters, isEditing } =
    useDashboardContext();

  const visibleParameters = getVisibleParameters(parameters, hideParameters);
  const hasVisibleParameters = visibleParameters.length > 0;

  const parameterPanelRef = useRef<HTMLElement>(null);
  // PROTOTYPE: in "Modern nav - C" with the nav closed, a full-width
  // dashboard's filters line up with its title and the open-sidebar button.
  const navToggleInset = useNavToggleInset();
  const alignedInset =
    dashboard?.width !== "fixed" ? navToggleInset : undefined;
  const allowSticky = isParametersWidgetContainersSticky(
    visibleParameters.length,
  );
  const { isSticky } = useIsParameterPanelSticky({
    parameterPanelRef,
    disabled: !allowSticky || !hasVisibleParameters,
  });

  if (!dashboard) {
    return (
      <DashboardParameterPanelSkeleton
        dashboardId={dashboardId}
        hideParameters={hideParameters}
      />
    );
  }

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
          pl={alignedInset}
        >
          <FixedWidthContainer
            isFixedWidth={dashboard?.width === "fixed"}
            data-testid="fixed-width-filters"
          >
            <ParametersList />
          </FixedWidthContainer>
        </FullWidthContainer>
      </span>
    );
  }

  return (
    <span ref={parameterPanelRef}>
      <FullWidthContainer
        className={cx(S.ParametersWidgetContainer, {
          [S.allowSticky]: allowSticky,
          [S.isSticky]: isSticky,
          [S.isEmbeddingSdk]: isEmbeddingSdk(),
        })}
        data-testid="dashboard-parameters-widget-container"
        pl={alignedInset}
      >
        <FixedWidthContainer
          className={DashboardS.ParametersFixedWidthContainer}
          id={DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}
          isFixedWidth={dashboard?.width === "fixed"}
          data-testid="fixed-width-filters"
        >
          <ParametersList />
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
