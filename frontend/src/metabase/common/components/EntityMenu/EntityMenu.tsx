import type { ReactNode } from "react";
import { Component, createRef } from "react";

import { EntityMenuItem } from "metabase/common/components/EntityMenuItem";
import { EntityMenuTrigger } from "metabase/common/components/EntityMenuTrigger";
import type { EntityMenuIconButtonProps } from "metabase/common/components/EntityMenuTrigger/EntityMenuTrigger.styled";
import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import { Divider, Popover } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

interface EntityMenuBaseItem {
  key?: string;
  testId?: string;
}

interface EntityMenuStyledItem extends EntityMenuBaseItem {
  title: string;
  icon?: string;
  tooltip?: ReactNode;
  color?: ColorName;
  hoverColor?: ColorName;
  hoverBgColor?: ColorName;
}

interface EntityMenuSeparatorItem extends EntityMenuBaseItem {
  separator: true;
}

interface EntityMenuContentItem extends EntityMenuStyledItem {
  content: (
    toggleMenu: () => void,
    setFreezeMenu: (freeze: boolean) => void,
  ) => ReactNode;
}

interface EntityMenuComponentItem extends EntityMenuBaseItem {
  component: ReactNode;
}

interface EntityMenuActionItem extends EntityMenuStyledItem {
  action?: (...args: any[]) => void;
  link?: string;
  externalLink?: boolean;
  event?: string;
  disabled?: boolean;
  onClose?: () => void;
}

type EntityMenuItemType =
  | EntityMenuSeparatorItem
  | EntityMenuContentItem
  | EntityMenuComponentItem
  | EntityMenuActionItem
  | null
  | undefined;

interface EntityMenuProps {
  items: EntityMenuItemType[];
  triggerIcon?: string;
  triggerProps?: EntityMenuIconButtonProps;
  minWidth?: number;
  tooltip?: string;
  trigger?: React.ReactElement;
  renderTrigger?: (props: { open: boolean; onClick: () => void }) => ReactNode;
  triggerAriaLabel?: string;
  tooltipPlacement?: "top" | "bottom";
  transitionDuration?: number;
  className?: string;
}

interface EntityMenuState {
  open: boolean;
  freezeMenu: boolean;
  menuItemContent: ReactNode;
}

/**
 * @deprecated: use Menu from "metabase/ui"
 */
export class EntityMenu extends Component<EntityMenuProps, EntityMenuState> {
  state: EntityMenuState = {
    open: false,
    freezeMenu: false,
    menuItemContent: null,
  };

  rootRef = createRef<HTMLDivElement>();

  toggleMenu = () => {
    if (this.state.freezeMenu) {
      return;
    }

    const open = !this.state.open;
    this.setState({ open, menuItemContent: null });
  };

  setFreezeMenu = (freezeMenu: boolean) => {
    this.setState({ freezeMenu });
  };

  replaceMenuWithItemContent = (menuItemContent: ReactNode) => {
    this.setState({ menuItemContent });
  };

  render() {
    const {
      items,
      triggerIcon = "ellipsis",
      triggerProps,
      minWidth,
      tooltip,
      trigger,
      renderTrigger,
      triggerAriaLabel,
      tooltipPlacement,
      transitionDuration = 150,
      className,
    } = this.props;
    const { open, menuItemContent } = this.state;

    return (
      <Popover
        opened={open}
        transitionProps={{ duration: transitionDuration }}
        onChange={() => this.toggleMenu()}
        position="bottom-end"
      >
        <Popover.Target>
          <div className={className}>
            {renderTrigger ? (
              renderTrigger({ open, onClick: this.toggleMenu })
            ) : (
              <EntityMenuTrigger
                ariaLabel={triggerAriaLabel}
                trigger={trigger}
                icon={triggerIcon}
                onClick={this.toggleMenu}
                open={open}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                triggerProps={triggerProps}
              />
            )}
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          {menuItemContent || (
            <ol className={CS.p1} style={{ minWidth: minWidth ?? 184 }}>
              {items.map((item) => {
                if (!item) {
                  return null;
                }

                const key =
                  item.key ?? ("title" in item ? item.title : undefined);
                const itemId = key
                  ? `entity-menu-item-${encodeURIComponent(key)}`
                  : undefined;

                if ("separator" in item && item.separator) {
                  return (
                    <li key={key}>
                      <Divider m="sm" />
                    </li>
                  );
                }

                if ("content" in item && item.content) {
                  return (
                    <li
                      key={key}
                      data-testid={item.testId}
                      aria-labelledby={itemId}
                    >
                      <EntityMenuItem
                        htmlId={itemId}
                        icon={item.icon as IconName}
                        title={item.title}
                        action={() =>
                          this.replaceMenuWithItemContent(
                            item.content(this.toggleMenu, this.setFreezeMenu),
                          )
                        }
                        tooltip={item.tooltip}
                        color={item.color}
                        hoverColor={item.hoverColor}
                        hoverBgColor={item.hoverBgColor}
                      />
                    </li>
                  );
                }

                if ("component" in item && item.component) {
                  return (
                    <li key={key} data-testid={item.testId}>
                      {item.component}
                    </li>
                  );
                }

                if ("action" in item || "link" in item) {
                  return (
                    <li
                      key={key}
                      data-testid={item.testId}
                      aria-labelledby={itemId}
                    >
                      <EntityMenuItem
                        htmlId={itemId}
                        icon={item.icon as IconName}
                        title={item.title}
                        externalLink={item.externalLink}
                        action={
                          item.action &&
                          ((e) => {
                            item.action?.(e);
                            this.toggleMenu();
                          })
                        }
                        link={item.link}
                        tooltip={item.tooltip}
                        disabled={item.disabled}
                        onClose={() => {
                          this.toggleMenu();
                          item.onClose?.();
                        }}
                        color={item.color}
                        hoverColor={item.hoverColor}
                        hoverBgColor={item.hoverBgColor}
                      />
                    </li>
                  );
                }

                return null;
              })}
            </ol>
          )}
        </Popover.Dropdown>
      </Popover>
    );
  }
}
