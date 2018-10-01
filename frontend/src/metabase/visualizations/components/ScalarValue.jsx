/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */

import React from "react";
import cx from "classnames";

import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { Flex } from "grid-styled";

export const ScalarWrapper = ({ children }) => (
  <Flex
    align="center"
    justify="center"
    flexDirection="column"
    className="full-height full flex-wrap relative"
    flex={1}
  >
    {children}
  </Flex>
);

const ScalarValue = ({ value, isFullscreen, isDashboard }) => (
  <h1
    className="cursor-pointer text-brand-hover"
    style={{ fontSize: "2.8rem", fontWeight: 900 }}
  >
    {value}
  </h1>
);

export const ScalarTitle = ({ title, description, onClick }) => (
  <div>
    <Ellipsified tooltip={title}>
      <span
        onClick={onClick}
        className={cx(
          "fullscreen-normal-text fullscreen-night-text text-brand-hover",
          {
            "cursor-pointer": !!onClick,
          },
        )}
      >
        <h3>{title}</h3>
      </span>
    </Ellipsified>
    {description && (
      <div
        className="absolute top bottom hover-child flex align-center justify-center"
        style={{ right: -20, top: 2 }}
      >
        <Tooltip tooltip={description} maxWidth={"22em"}>
          <Icon name="infooutlined" />
        </Tooltip>
      </div>
    )}
  </div>
);

export default ScalarValue;
