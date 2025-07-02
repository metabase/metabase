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
}

export const CollapsibleDashboardParameterList = forwardRef<
  HTMLDivElement,
  CollapsibleDashboardParameterListProps
>(function CollapsibleDashboardParameterList(
  { isCollapsed, ...listProps },
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
    widgetsVariant: "subtle" as const,
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
              aria-label={t`Show filters`}
              tooltipLabel={t`Show filters`}
              onClick={(e) => {
                // To avoid focusing the input when clicking the button
                e.stopPropagation();
              }}
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
      <DashboardParameterList
        {...parametersListCommonProps}
        className={cx(CS.absolute, CS.hidden, CS.pointerEventsNone)}
        hasTestIdProps={false}
        ref={ref}
      />
      {renderContent()}
    </>
  );
});
