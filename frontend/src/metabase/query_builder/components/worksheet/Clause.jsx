import React from "react";
import cx from "classnames";

import { alpha } from "metabase/lib/colors";

const Clause = ({ children, style = {}, color }) => (
  <div
    className="rounded text-white p2 mr1"
    style={{ backgroundColor: color, ...style }}
  >
    {children}
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
