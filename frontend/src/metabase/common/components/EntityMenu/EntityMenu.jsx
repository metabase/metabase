/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component, createRef } from "react";

import { EntityMenuItem } from "metabase/common/components/EntityMenuItem";
import { EntityMenuTrigger } from "metabase/common/components/EntityMenuTrigger";
import CS from "metabase/css/core/index.css";
import { Divider, Popover } from "metabase/ui";

/**
 * @deprecated: use Menu from "metabase/ui"
 */
export class EntityMenu extends Component {
  state = {
    open: false,
    freezeMenu: false,
    menuItemContent: null,
  };

  static defaultProps = {
    horizontalAttachments: ["left", "right"],
  };

  constructor(props, context) {
    super(props, context);

    this.rootRef = createRef();
  }

  toggleMenu = () => {
    if (this.state.freezeMenu) {
      return;
    }

    const open = !this.state.open;
    this.setState({ open, menuItemContent: null });
  };

  setFreezeMenu = (freezeMenu) => {
    this.setState({ freezeMenu });
  };

  replaceMenuWithItemContent = (menuItemContent) => {
    this.setState({ menuItemContent });
  };

  render() {
    const {
      items,
      triggerIcon,
      triggerProps,
      className,
      openClassNames,
      closedClassNames,
      minWidth,
      tooltip,
      trigger,
      renderTrigger,
      triggerAriaLabel,
      tooltipPlacement,
      transitionDuration = 150,
    } = this.props;
    const { open, menuItemContent } = this.state;

    return (
      <Popover
        opened={open}
        className={cx(className, open ? openClassNames : closedClassNames)}
        transitionProps={{ duration: transitionDuration }}
        onChange={() => this.toggleMenu()}
        position="bottom-end"
      >
        <Popover.Target>
          <div>
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

                const key = item.key ?? item.title;
                const itemId = `entity-menu-item-${encodeURIComponent(key)}`;

                if (item.separator) {
                  return (
                    <li key={key}>
                      <Divider m="sm" />
                    </li>
                  );
                }

                if (item.content) {
                  return (
                    <li
                      key={key}
                      data-testid={item.testId}
                      aria-labelledby={itemId}
                    >
                      <EntityMenuItem
                        htmlId={itemId}
                        icon={item.icon}
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

                if (item.component) {
                  return (
                    <li key={key} data-testid={item.testId}>
                      {item.component}
                    </li>
                  );
                }

                return (
                  <li
                    key={key}
                    data-testid={item.testId}
                    aria-labelledby={itemId}
                  >
                    <EntityMenuItem
                      htmlId={itemId}
                      icon={item.icon}
                      title={item.title}
                      externalLink={item.externalLink}
                      action={
                        item.action &&
                        ((e) => {
                          item.action(e);
                          this.toggleMenu();
                        })
                      }
                      event={item.event}
                      link={item.link}
                      tooltip={item.tooltip}
                      disabled={item.disabled}
                      onClose={() => {
                        this.toggleMenu();
                        item?.onClose?.();
                      }}
                      color={item.color}
                      hoverColor={item.hoverColor}
                      hoverBgColor={item.hoverBgColor}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </Popover.Dropdown>
      </Popover>
    );
  }
}
