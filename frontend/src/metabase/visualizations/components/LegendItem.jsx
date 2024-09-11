/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Icon, Tooltip } from "metabase/ui";

import LegendS from "./Legend.module.css";
import { IconContainer } from "./LegendItem.styled";
import { LegendItemDot } from "./legend/LegendItemDot";

const propTypes = {
  icon: PropTypes.object,
};

export default class LegendItem extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  static defaultProps = {
    showDot: true,
    showTitle: true,
    isVisible: true,
    isMuted: false,
    showTooltip: true,
    showDotTooltip: true,
  };

  render() {
    const {
      title,
      color,
      icon,
      showDot,
      showTitle,
      isVisible,
      isMuted,
      showTooltip,
      showDotTooltip,
      onMouseEnter,
      onMouseLeave,
      className,
      description,
      onClick,
      infoClassName,
      onToggleSeriesVisibility,
    } = this.props;

    return (
      <span
        data-testid="legend-item"
        className={cx(
          className,
          LegendS.LegendItem,
          { [LegendS.LegendItemMuted]: isMuted },
          CS.noDecoration,
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
          CS.flex,
          CS.alignCenter,
          {
            [CS.mr1]: showTitle,
            [CS.cursorPointer]: onClick,
          },
        )}
        style={{
          overflowX: "hidden",
          flex: "0 1 auto",
          paddingLeft: showDot ? "4px" : "0",
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      >
        {icon && (
          <IconContainer>
            <Icon {...icon} />
          </IconContainer>
        )}
        {showDot && (
          <Tooltip
            label={title}
            disabled={!showTooltip || !showDotTooltip}
            arrowPosition="center"
          >
            <LegendItemDot
              color={color}
              isVisible={isVisible}
              onClick={onToggleSeriesVisibility}
            />
          </Tooltip>
        )}
        {showTitle && (
          <div
            className={cx(CS.flex, CS.alignCenter, CS.overflowHidden)}
            style={showDot && { marginLeft: "4px" }}
          >
            <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
            {description && (
              <div
                className={cx(
                  CS.hoverChild,
                  CS.ml1,
                  CS.flex,
                  CS.alignCenter,
                  CS.textMedium,
                )}
              >
                <Tooltip tooltip={description} maxWidth="22em">
                  <Icon className={infoClassName} name="info" />
                </Tooltip>
              </div>
            )}
          </div>
        )}
      </span>
    );
  }
}

LegendItem.propTypes = propTypes;
