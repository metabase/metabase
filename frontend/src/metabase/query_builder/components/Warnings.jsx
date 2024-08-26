/* eslint-disable react/prop-types */
import cx from "classnames";

import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

const Warnings = ({ warnings, className = "", size = 16 }) => {
  if (!warnings || warnings.length === 0) {
    return null;
  }
  const tooltip = (
    <ul className={cx(CS.px2, CS.pt2, CS.pb1)} style={{ maxWidth: 350 }}>
      {warnings.map(warning => (
        <li className={CS.pb1} key={warning}>
          {warning}
        </li>
      ))}
    </ul>
  );

  return (
    <Tooltip tooltip={tooltip}>
      <Icon className={className} name="warning" size={size} />
    </Tooltip>
  );
};

export default Warnings;
