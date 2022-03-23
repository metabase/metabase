/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { ScalarRoot, ScalarValueWrapper } from "./ScalarValue.styled";

export const ScalarWrapper = ({ children }) => (
  <ScalarRoot>{children}</ScalarRoot>
);

const ScalarValue = ({
  value,
  isDashboard,
  gridSize,
  width,
  height,
  numGridColumns,
}) => (
  <ScalarValueWrapper
    isDashboard={isDashboard}
    gridSize={gridSize}
    width={width}
    height={height}
    numGridColumns={numGridColumns}
    className="ScalarValue"
  >
    {value}
  </ScalarValueWrapper>
);

const ICON_WIDTH = 24;

export const ScalarTitle = ({ title, description, onClick }) => (
  <div className="flex align-center full justify-center px2">
    {/*
      This is a hacky spacer so that the h3 is centered correctly.
      It needs match the width of the tooltip icon on the other side.
     */}
    {description && description.length > 0 && (
      <div style={{ width: ICON_WIDTH }} />
    )}
    <h3
      onClick={onClick}
      className={cx(
        "Scalar-title overflow-hidden fullscreen-normal-text fullscreen-night-text text-brand-hover",
        {
          "cursor-pointer": !!onClick,
        },
      )}
    >
      <Ellipsified tooltip={title}>{title}</Ellipsified>
    </h3>
    {description && description.length > 0 && (
      <div
        className="hover-child cursor-pointer pl1 text-brand-hover"
        style={{ marginTop: 5, width: ICON_WIDTH }}
      >
        <Tooltip tooltip={description} maxWidth={"22em"}>
          <Icon name="info_outline" />
        </Tooltip>
      </div>
    )}
  </div>
);

export default ScalarValue;
