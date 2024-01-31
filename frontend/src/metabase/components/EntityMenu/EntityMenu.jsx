/* eslint-disable react/prop-types */
import { createRef, Component } from "react";
import cx from "classnames";

import { Popover } from "metabase/ui";

import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";
import EntityMenuItem from "metabase/components/EntityMenuItem";

/**
 * @deprecated: use Menu from "metabase/ui"
 */
class EntityMenu extends Component {
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

  setFreezeMenu = freezeMenu => {
    this.setState({ freezeMenu });
  };

  replaceMenuWithItemContent = menuItemContent => {
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
    } = this.props;
    const { open, menuItemContent } = this.state;
    return (
      <Popover
        opened={open}
        className={cx(className, open ? openClassNames : closedClassNames)}
        transitionProps={{ transition: "fade" }}
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
            <ol className="p1" style={{ minWidth: minWidth ?? 184 }}>
              {items.map(item => {
                if (!item) {
                  return null;
                } else if (item.content) {
                  return (
                    <li key={item.title} data-testid={item.testId}>
                      <EntityMenuItem
                        icon={item.icon}
                        title={item.title}
                        action={() =>
                          this.replaceMenuWithItemContent(
                            item.content(this.toggleMenu, this.setFreezeMenu),
                          )
                        }
                        tooltip={item.tooltip}
                      />
                    </li>
                  );
                } else {
                  return (
                    <li key={item.title} data-testid={item.testId}>
                      <EntityMenuItem
                        icon={item.icon}
                        title={item.title}
                        externalLink={item.externalLink}
                        action={
                          item.action &&
                          (e => {
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
                      />
                    </li>
                  );
                }
              })}
            </ol>
          )}
        </Popover.Dropdown>
      </Popover>
    );
  }
}

export default EntityMenu;
