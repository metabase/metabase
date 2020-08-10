import React, { Component } from "react";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";

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
          <div className="flex align-center overflow-hidden">
            <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
            {description && (
              <div className="hover-child ml1 flex align-center text-medium">
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
