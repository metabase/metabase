import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import type { SettingElement } from "metabase-types/api/settings";

type SettingToggleProps = {
  disabled: boolean;
  hideLabel: boolean;
  id: string;
  setting: SettingElement;
  tooltip: ReactNode;
  onChange: ((value: boolean) => void) | undefined;
  onChangeSetting?: unknown;
  reloadSettings?: unknown;
  settingValues?: unknown;
};

export const SettingToggle = ({
  disabled,
  hideLabel,
  id,
  setting,
  tooltip,
  onChange,
  // the following three props were being spread into the 'div', causing
  // unknown prop errors so we're just keeping them here
  onChangeSetting,
  reloadSettings,
  settingValues,
  ...props
}: SettingToggleProps) => {
  const value = setting.value == null ? setting.default : setting.value;
  const on = value === true || value === "true";
  return (
    <div {...props} className={cx(CS.flex, CS.alignCenter, CS.pt1)}>
      <Tooltip tooltip={tooltip} isEnabled={!!tooltip}>
        <Toggle
          id={id}
          value={on}
          onChange={!disabled ? () => onChange?.(!on) : undefined}
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
