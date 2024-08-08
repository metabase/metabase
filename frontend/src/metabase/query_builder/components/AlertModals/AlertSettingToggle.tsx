import cx from "classnames";

import Radio from "metabase/core/components/Radio";
import CS from "metabase/css/core/index.css";

type AlertSettingToggleProps = {
  alert: any;
  onAlertChange: (alert: any) => void;
  title: string;
  trueText: string;
  falseText: string;
  setting: string;
};

export const AlertSettingToggle = ({
  alert,
  onAlertChange,
  title,
  trueText,
  falseText,
  setting,
}: AlertSettingToggleProps) => (
  <div className={cx(CS.mb4, CS.pb2)}>
    <h3 className={cx(CS.textDark, CS.mb1)}>{title}</h3>
    <Radio
      value={alert[setting]}
      onChange={value => onAlertChange({ ...alert, [setting]: value })}
      options={[
        { name: trueText, value: true },
        { name: falseText, value: false },
      ]}
    />
  </div>
);
