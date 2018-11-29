import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";

import { alpha } from "metabase/lib/colors";

const Clause = ({ children, style = {}, color, onRemove }) => (
  <div
    className="rounded text-white p2 mr1 flex align-center"
    style={{ backgroundColor: color, ...style }}
  >
    {children}
    {onRemove && (
      <Icon
        name="close"
        className="py1 pl1 cursor-pointer"
        onClick={onRemove}
      />
    )}
  </div>
);

export const ClauseContainer = ({ className, style = {}, children, color }) => (
  <div
    className={cx(className, "rounded text-medium p2 flex")}
    style={{ backgroundColor: alpha(color, 0.25), ...style }}
  >
    {children}
  </div>
);

export default Clause;
