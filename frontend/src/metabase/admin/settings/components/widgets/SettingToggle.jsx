/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";

const SettingToggle = ({
  disabled,
  hideLabel,
  id,
  setting,
  tooltip,
  onChange,
  ...props
}) => {
  const value = setting.value == null ? setting.default : setting.value;
  const on = value === true || value === "true";
  return (
    <div {...props} className={cx(CS.flex, CS.alignCenter, CS.pt1)}>
      <Tooltip tooltip={tooltip} isEnabled={!!tooltip}>
        <Toggle
          id={id}
          value={on}
          onChange={!disabled ? () => onChange(!on) : null}
          disabled={disabled}
        />
      </Tooltip>
      {!hideLabel && (
        <span className={cx(CS.textBold, CS.mx1)}>
          {on ? t`Enabled` : t`Disabled`}
        </span>
      )}
    </div>
  );
};

export default SettingToggle;
