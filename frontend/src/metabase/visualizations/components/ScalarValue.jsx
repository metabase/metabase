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
  <h1 className="ScalarValue cursor-pointer text-brand-hover">{value}</h1>
);

export const ScalarTitle = ({ title, description, onClick }) => (
  <div className="flex align-center full justify-center px2">
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
    {description &&
      description.length > 0 && (
        <div
          className="hover-child cursor-pointer ml1 text-brand-hover"
          style={{ marginTop: 5 }}
        >
          <Tooltip tooltip={description} maxWidth={"22em"}>
            <Icon name="infooutlined" />
          </Tooltip>
        </div>
      )}
  </div>
);

export default ScalarValue;
