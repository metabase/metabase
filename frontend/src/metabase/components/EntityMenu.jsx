import React, { Component } from "react";
import { Motion, spring } from "react-motion";
import cx from "classnames";

import Card from "metabase/components/Card";
import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";
import EntityMenuItem from "metabase/components/EntityMenuItem";
import Popover from "metabase/components/Popover";

type EntityMenuOption = {
  icon: string,
  title: string,
  action?: () => void,
  link?: string,
};

type Props = {
  items: Array<EntityMenuOption>,
  triggerIcon: string,
  className?: string,
};

class EntityMenu extends Component {
  props: Props;

  state = {
    open: false,
    freezeMenu: false,
    menuItemContent: null,
  };

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

  replaceMenuWithItemContent = (menuItemContent: any) => {
    this.setState({ menuItemContent });
  };

  render() {
    const { items, triggerIcon, className } = this.props;
    const { open, menuItemContent } = this.state;
    return (
      <div className={cx("relative", className)}>
        <EntityMenuTrigger
          icon={triggerIcon}
          onClick={this.toggleMenu}
          open={open}
        />
        <Popover
          isOpen={open}
          onClose={this.toggleMenu}
          hasArrow={false}
          hasBackground={false}
          horizontalAttachments={["right"]}
          targetOffsetY={0}
        >
          {/* Note: @kdoh 10/12/17
            * React Motion has a flow type problem with children see
            * https://github.com/chenglou/react-motion/issues/375
            * TODO This can be removed if we upgrade to flow 0.53 and react-motion >= 0.5.1
            */}
          <Motion
            defaultStyle={{
              opacity: 0,
              translateY: 0,
            }}
            style={{
              opacity: open ? spring(1) : spring(0),
              translateY: open ? spring(10) : spring(0),
            }}
          >
            {({ opacity, translateY }) => (
              <div
                style={{
                  opacity: opacity,
                  transform: `translateY(${translateY}px)`,
                }}
              >
                <Card>
                  {menuItemContent || (
                    <ol className="py1" style={{ minWidth: 210 }}>
                      {items.map(item => {
                        if (item.content) {
                          return (
                            <li key={item.title}>
                              <EntityMenuItem
                                icon={item.icon}
                                title={item.title}
                                action={() =>
                                  this.replaceMenuWithItemContent(
                                    item.content(
                                      this.toggleMenu,
                                      this.setFreezeMenu,
                                    ),
                                  )
                                }
                              />
                            </li>
                          );
                        } else {
                          return (
                            <li key={item.title}>
                              <EntityMenuItem
                                icon={item.icon}
                                title={item.title}
                                action={
                                  item.action &&
                                  (() => {
                                    item.action();
                                    this.toggleMenu();
                                  })
                                }
                                event={item.event && item.event}
                                link={item.link}
                                onClose={() => this.toggleMenu()}
                              />
                            </li>
                          );
                        }
                      })}
                    </ol>
                  )}
                </Card>
              </div>
            )}
          </Motion>
        </Popover>
      </div>
    );
  }
}

export default EntityMenu;
