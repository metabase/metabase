import cx from "classnames";

import RefreshOptionS from "metabase/dashboard/components/RefreshWidget/RefreshOption/RefreshOption.module.css";
import { Icon } from "metabase/ui";

export const RefreshOption = ({
  name,
  period,
  selected,
  onClick,
}: {
  name: string;
  period: number | null;
  selected: boolean;
  onClick: () => void;
}) => (
  <li
    className={cx(RefreshOptionS.RefreshOptionItem, {
      [RefreshOptionS.Selected]: selected,
      [RefreshOptionS.Enabled]: period != null,
    })}
    onClick={onClick}
  >
    <Icon className={RefreshOptionS.RefreshOptionIcon} name="check" />
    <span>{name}</span>
  </li>
);
