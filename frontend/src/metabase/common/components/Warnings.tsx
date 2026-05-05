import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Icon, Tooltip } from "metabase/ui";

interface WarningsProps {
  warnings?: string[];
  className?: string;
  size?: number;
}

export const Warnings = ({
  warnings,
  className = "",
  size = 16,
}: WarningsProps) => {
  if (!warnings || warnings.length === 0) {
    return null;
  }
  const tooltip = (
    <ul className={cx(CS.px2, CS.pt2, CS.pb1)} style={{ maxWidth: 350 }}>
      {warnings.map((warning) => (
        <li className={CS.pb1} key={warning}>
          {warning}
        </li>
      ))}
    </ul>
  );

  return (
    <Tooltip label={tooltip}>
      <Icon className={className} name="warning" size={size} />
    </Tooltip>
  );
};
