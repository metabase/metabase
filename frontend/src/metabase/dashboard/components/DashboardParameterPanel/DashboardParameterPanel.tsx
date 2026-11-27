import cx from "classnames";
import { useRef, useState } from "react";
import { c, msgid, ngettext, t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { useIsParameterPanelSticky } from "metabase/dashboard/hooks/use-is-parameter-panel-sticky";
import { getDashboardHeaderValuePopulatedParameters } from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { useSelector } from "metabase/redux";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { ActionIcon, Flex, Icon, Indicator, Tooltip } from "metabase/ui";
import { isSmallScreen } from "metabase/utils/dom";
import { DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/visualizations/lib/save-dashboard-pdf";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { parameterHasNoDisplayValue } from "metabase-lib/v1/parameters/utils/parameter-values";

import DashboardS from "../Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "../Dashboard/DashboardComponents";
import { ParametersList } from "../Dashboard/components";

import S from "./DashboardParameterPanel.module.css";
import { DashboardParameterPanelSkeleton } from "./DashboardParameterPanelSkeleton";
import { type ListItemWidths, useListItemWidths } from "./use-list-item-widths";
import { getCollapsedRowItemIndexes } from "./utils";

export function DashboardParameterPanel() {
  const parameters = useSelector(getDashboardHeaderValuePopulatedParameters);

  const { dashboard, dashboardId, hideParameters, isEditing } =
    useDashboardContext();

  const visibleParameters = getVisibleParameters(parameters, hideParameters);
  const hasVisibleParameters = visibleParameters.length > 0;

  const parameterPanelRef = useRef<HTMLElement>(null);
  const parametersListRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const listItemWidths = useListItemWidths({
    listRef: parametersListRef,
    itemCount: visibleParameters.length,
    isEnabled: dashboard != null && !isEditing,
  });
  const overflowParameters = getOverflowParameters(
    visibleParameters,
    listItemWidths,
  );
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
      >
        <FixedWidthContainer
          className={DashboardS.ParametersFixedWidthContainer}
          id={DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}
          isFixedWidth={dashboard?.width === "fixed"}
          data-testid="fixed-width-filters"
        >
          <Flex w="100%" align="flex-start" gap="sm">
            <ParametersList
              ref={parametersListRef}
              className={S.ParametersList}
              hiddenParameterIds={
                isCollapsed
                  ? overflowParameters.map((parameter) => parameter.id)
                  : undefined
              }
            />
            {overflowParameters.length > 0 && (
              <OverflowToggle
                isCollapsed={isCollapsed}
                overflowParameters={overflowParameters}
                onToggle={() => setIsCollapsed((collapsed) => !collapsed)}
              />
            )}
          </Flex>
        </FixedWidthContainer>
      </FullWidthContainer>
    </span>
  );
}

interface OverflowToggleProps {
  isCollapsed: boolean;
  overflowParameters: UiParameter[];
  onToggle: () => void;
}

function OverflowToggle({
  isCollapsed,
  overflowParameters,
  onToggle,
}: OverflowToggleProps) {
  const activeCount = overflowParameters.filter(hasValue).length;
  const label = getOverflowToggleLabel({
    isCollapsed,
    hiddenCount: overflowParameters.length,
    activeCount,
  });

  return (
    <Indicator size={8} offset={7} disabled={!isCollapsed || activeCount === 0}>
      <Tooltip label={label}>
        <ActionIcon
          variant="subtle"
          aria-label={label}
          aria-expanded={!isCollapsed}
          onClick={onToggle}
        >
          <Icon name={isCollapsed ? "chevrondown" : "chevronup"} />
        </ActionIcon>
      </Tooltip>
    </Indicator>
  );
}

function getOverflowToggleLabel({
  isCollapsed,
  hiddenCount,
  activeCount,
}: {
  isCollapsed: boolean;
  hiddenCount: number;
  activeCount: number;
}) {
  if (!isCollapsed) {
    return t`Show fewer filters`;
  }
  if (activeCount > 0) {
    return c("{1} is how many of the hidden filters have a value").ngettext(
      msgid`Show ${hiddenCount} more filter (${activeCount} active)`,
      `Show ${hiddenCount} more filters (${activeCount} active)`,
      hiddenCount,
    );
  }
  return ngettext(
    msgid`Show ${hiddenCount} more filter`,
    `Show ${hiddenCount} more filters`,
    hiddenCount,
  );
}

// Filters left off the row the list collapses to, which favours ones with a value
function getOverflowParameters(
  parameters: UiParameter[],
  listItemWidths: ListItemWidths | null,
): UiParameter[] {
  if (!listItemWidths) {
    return [];
  }
  const rowIndexes = getCollapsedRowItemIndexes({
    ...listItemWidths,
    isPriority: parameters.map(hasValue),
  });
  return parameters.filter((_parameter, index) => !rowIndexes.includes(index));
}

function hasValue(parameter: UiParameter) {
  return !parameterHasNoDisplayValue(parameter.value);
}

function isParametersWidgetContainersSticky(parameterCount: number) {
  if (!isSmallScreen()) {
    return true;
  }

  // Sticky header with more than 5 parameters
  // takes too much space on small screens
  return parameterCount <= 5;
}
