/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { Motion, spring } from "react-motion";

import { isReducedMotionPreferred } from "metabase/lib/dom";

import Card from "metabase/components/Card";
import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";
import EntityMenuItem from "metabase/components/EntityMenuItem";
import Popover from "metabase/components/Popover";

import { Container } from "./EntityMenu.styled";

const MENU_SHIFT_Y = 10;

class EntityMenu extends Component {
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

  setFreezeMenu = freezeMenu => {
    this.setState({ freezeMenu });
  };

  replaceMenuWithItemContent = menuItemContent => {
    this.setState({ menuItemContent });
  };

  render() {
    const preferReducedMotion = isReducedMotionPreferred();

    const {
      items,
      triggerIcon,
      triggerProps,
      className,
      tooltip,
      trigger,
      targetOffsetY,
    } = this.props;
    const { open, menuItemContent } = this.state;
    return (
      <Container className={className} open={open}>
        <EntityMenuTrigger
          trigger={trigger}
          icon={triggerIcon}
          onClick={this.toggleMenu}
          open={open}
          tooltip={tooltip}
          triggerProps={triggerProps}
        />
        <Popover
          isOpen={open}
          onClose={this.toggleMenu}
          hasArrow={false}
          hasBackground={false}
          horizontalAttachments={["left", "right"]}
          targetOffsetY={targetOffsetY || 0}
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
              translateY: open ? spring(MENU_SHIFT_Y) : spring(0),
            }}
          >
            {({ opacity, translateY }) => {
              const motionOpacity = preferReducedMotion
                ? opacity > 0.5
                  ? 1
                  : 0
                : opacity;
              const motionY = preferReducedMotion
                ? translateY > MENU_SHIFT_Y / 2
                  ? MENU_SHIFT_Y
                  : 0
                : translateY;
              return (
                <div
                  style={{
                    opacity: motionOpacity,
                    transform: `translateY(${motionY}px)`,
                  }}
                >
                  <Card>
                    {menuItemContent || (
                      <ol className="py1" style={{ minWidth: 210 }}>
                        {items.map(item => {
                          if (!item) {
                            return null;
                          } else if (item.content) {
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
                                  externalLink={item.externalLink}
                                  action={
                                    item.action &&
                                    (() => {
                                      item.action();
                                      this.toggleMenu();
                                    })
                                  }
                                  event={item.event && item.event}
                                  link={item.link}
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
                  </Card>
                </div>
              );
            }}
          </Motion>
        </Popover>
      </Container>
    );
  }
}

export default EntityMenu;
