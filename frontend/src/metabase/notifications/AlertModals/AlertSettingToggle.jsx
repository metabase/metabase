/* eslint-disable react/prop-types */
import cx from "classnames";

import Radio from "metabase/core/components/Radio";
import CS from "metabase/css/core/index.css";

export const AlertSettingToggle = ({
  alert,
  onAlertChange,
  title,
  trueText,
  falseText,
  setting,
}) => (
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
