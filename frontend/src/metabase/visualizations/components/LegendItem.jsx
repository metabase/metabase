import React, { Component } from "react";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

import cx from "classnames";

// Don't use a <a> tag if there's no href
const LegendLink = props =>
  props.href ? <a {...props} /> : <span {...props} />;

export default class LegendItem extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  static propTypes = {};
  static defaultProps = {
    showDot: true,
    showTitle: true,
    isMuted: false,
    showTooltip: true,
    showDotTooltip: true,
  };

  render() {
    const {
      title,
      color,
      showDot,
      showTitle,
      isMuted,
      showTooltip,
      showDotTooltip,
      onMouseEnter,
      onMouseLeave,
      className,
      description,
      onClick,
      infoClassName,
    } = this.props;
    return (
      <LegendLink
        className={cx(
          className,
          "LegendItem",
          "no-decoration flex align-center fullscreen-normal-text fullscreen-night-text",
          {
            mr1: showTitle,
            muted: isMuted,
            "cursor-pointer": onClick,
          },
        )}
        style={{ overflowX: "hidden", flex: "0 1 auto" }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      >
        {showDot && (
          <Tooltip tooltip={title} isEnabled={showTooltip && showDotTooltip}>
            <div
              className={cx("flex-no-shrink", "inline-block circular")}
              style={{
                width: 13,
                height: 13,
                margin: 4,
                marginRight: 8,
                backgroundColor: color,
              }}
            />
          </Tooltip>
        )}
        {showTitle && (
          <div className="flex align-center">
            <span className="mr1">
              <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
            </span>
            {description && (
              <div className="hover-child">
                <Tooltip tooltip={description} maxWidth={"22em"}>
                  <Icon className={infoClassName} name="info" />
                </Tooltip>
              </div>
            )}
          </div>
        )}
      </LegendLink>
    );
  }
}
