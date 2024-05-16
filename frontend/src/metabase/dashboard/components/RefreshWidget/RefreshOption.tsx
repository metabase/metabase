import cx from "classnames";

import RefreshWidgetS from "metabase/dashboard/components/RefreshWidget/RefreshWidget.module.css";
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
    className={cx(RefreshWidgetS.RefreshOptionItem, {
      [RefreshWidgetS.Selected]: selected,
      [RefreshWidgetS.Enabled]: period != null,
    })}
    onClick={onClick}
  >
    <Icon className={RefreshWidgetS.RefreshOptionIcon} name="check" />
    <span>{name}</span>
  </li>
);
