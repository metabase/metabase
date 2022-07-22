/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/core/components/Ellipsified";
import {
  ScalarRoot,
  ScalarValueWrapper,
  ScalarTitleRoot,
} from "./ScalarValue.styled";

import { findSize, getMaxFontSize } from "./utils";

const HORIZONTAL_PADDING = 32;

export const ScalarWrapper = ({ children }) => (
  <ScalarRoot>{children}</ScalarRoot>
);

const ScalarValue = ({
  value,
  width,
  gridSize,
  totalNumGridCols,
  fontFamily,
}) => {
  const fontSize = useMemo(
    () =>
      findSize({
        text: value,
        targetWidth: width - HORIZONTAL_PADDING,
        fontFamily: fontFamily ?? "Lato",
        fontWeight: 900,
        unit: "rem",
        step: 0.2,
        min: 2.2,
        max: gridSize ? getMaxFontSize(gridSize.width, totalNumGridCols) : 4,
      }),
    [fontFamily, gridSize, totalNumGridCols, value, width],
  );

  return (
    <ScalarValueWrapper className="ScalarValue" fontSize={fontSize}>
      {value}
    </ScalarValueWrapper>
  );
};

const ICON_WIDTH = 24;

export const ScalarTitle = ({ title, description, onClick }) => (
  <ScalarTitleRoot>
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
        "Scalar-title overflow-hidden text-centered fullscreen-normal-text fullscreen-night-text text-brand-hover",
        {
          "cursor-pointer": !!onClick,
        },
      )}
    >
      <Ellipsified tooltip={title} lines={2} placement="bottom">
        {title}
      </Ellipsified>
    </h3>
    {description && description.length > 0 && (
      <div
        className="hover-child cursor-pointer pl1 text-brand-hover"
        style={{ marginTop: 5, width: ICON_WIDTH }}
      >
        <Tooltip tooltip={description} maxWidth="22em">
          <Icon name="info_outline" />
        </Tooltip>
      </div>
    )}
  </ScalarTitleRoot>
);

export default ScalarValue;
