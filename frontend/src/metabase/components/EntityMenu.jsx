import React, { Component } from "react";
import { Motion, spring } from "react-motion";

import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import Card from "metabase/components/Card";
import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";
import EntityMenuItem from "metabase/components/EntityMenuItem";

type EntityMenuOption = {
  icon: string,
  title: string,
  action?: () => void,
  link?: string,
};

type Props = {
  items: Array<EntityMenuOption>,
  triggerIcon: string,
};

class EntityMenu extends Component {
  props: Props;

  state = {
    open: false,
    freezeMenu: false,
    menuItemContent: null,
  };

  toggleMenu = () => {
    if (this.state.freezeMenu) return;

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
    const { items, triggerIcon } = this.props;
    const { open, menuItemContent } = this.state;
    return (
      <div className="relative">
        <EntityMenuTrigger
          icon={triggerIcon}
          onClick={this.toggleMenu}
          open={open}
        />
        {open && (
          /* Note: @kdoh 10/12/17
                     * React Motion has a flow type problem with children see
                     * https://github.com/chenglou/react-motion/issues/375
                     * TODO This can be removed if we upgrade to flow 0.53 and react-motion >= 0.5.1
                     */
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
              <OnClickOutsideWrapper handleDismissal={this.toggleMenu}>
                <div
                  className="absolute right"
                  style={{
                    top: 35,
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
                                  action={() => {
                                    item.action();
                                    this.toggleMenu();
                                  }}
                                  link={item.link}
                                />
                              </li>
                            );
                          }
                        })}
                      </ol>
                    )}
                  </Card>
                </div>
              </OnClickOutsideWrapper>
            )}
          </Motion>
        )}
      </div>
    );
  }
}

export default EntityMenu;
