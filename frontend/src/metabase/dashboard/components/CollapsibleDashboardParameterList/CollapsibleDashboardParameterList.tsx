import cx from "classnames";
import type { ComponentProps } from "react";
import { forwardRef, useMemo } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import CS from "metabase/css/core/index.css";
import { DashboardParameterList } from "metabase/dashboard/components/DashboardParameterList";
import { useDashboardContext } from "metabase/dashboard/context";
import { Icon, Menu } from "metabase/ui";

interface CollapsibleDashboardParameterListProps
  extends ComponentProps<typeof DashboardParameterList> {
  isCollapsed: boolean;
  triggerClassName?: string;
}

export const CollapsibleDashboardParameterList = forwardRef<
  HTMLDivElement,
  CollapsibleDashboardParameterListProps
>(function CollapsibleDashboardParameterList(
  { isCollapsed, triggerClassName, ...listProps },
  ref,
) {
  const { editingParameter } = useDashboardContext();
  const { parameters } = listProps;

  const parametersWithValues = useMemo(
    () => parameters.filter((p) => p.value != null),
    [parameters],
  );

  const parametersListCommonProps = {
    ...listProps,
    isSortable: false,
    widgetsPopoverPosition: "bottom-end" as const,
  };

  const renderContent = () => {
    if (isCollapsed) {
      if (editingParameter) {
        const filteredParameters = parameters.filter(
          (p) => p.id === editingParameter.id,
        );
        return (
          <DashboardParameterList
            {...parametersListCommonProps}
            parameters={filteredParameters}
          />
        );
      }
      return (
        <Menu>
          <Menu.Target data-testid="show-filter-parameter-button">
            <ToolbarButton
              className={triggerClassName}
              aria-label={t`Show filters`}
              tooltipLabel={t`Show filters`}
              onMouseDown={preventDragOrInputFocus}
              onClick={preventDragOrInputFocus}
            >
              <Icon name="filter" />
              {parametersWithValues.length > 0 && (
                <span data-testid="show-filter-parameter-count">
                  &nbsp;{parametersWithValues.length}
                </span>
              )}
            </ToolbarButton>
          </Menu.Target>
          <Menu.Dropdown
            data-testid="show-filter-parameter-dropdown"
            style={{ overflow: "visible" }}
          >
            <DashboardParameterList
              {...parametersListCommonProps}
              widgetsWithinPortal={false}
              vertical
            />
          </Menu.Dropdown>
        </Menu>
      );
    }

    return <DashboardParameterList {...parametersListCommonProps} />;
  };

  return (
    <>
      {/* Invisible expanded parameter list for measurements */}
      <div
        className={cx(
          CS.fixed,
          CS.hidden,
          CS.pointerEventsNone,
          CS.fullWidth,
          CS.left,
        )}
      >
        <DashboardParameterList
          {...parametersListCommonProps}
          className={CS.absolute}
          hasTestIdProps={false}
          ref={ref}
        />
      </div>
      {renderContent()}
    </>
  );
});

function preventDragOrInputFocus(e: React.MouseEvent) {
  e.stopPropagation();
}
