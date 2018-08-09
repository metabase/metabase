import React from "react";
import { t } from "c-3po";
import Icon from "metabase/components/Icon";
import cx from "classnames";

import ChartSettingSelect from "./ChartSettingSelect.jsx";

const ChartSettingFieldPicker = ({ value, options, onChange, onRemove }) => (
  <div className="flex align-center">
    <ChartSettingSelect
      value={value}
      options={options}
      onChange={onChange}
      placeholder={t`Select a field`}
      placeholderNoOptions={t`No valid fields`}
      isInitiallyOpen={value === undefined}
    />
    <Icon
      name="close"
      className={cx("ml1 text-medium text-brand-hover cursor-pointer", {
        "disabled hidden": !onRemove,
      })}
      width={12}
      height={12}
      onClick={onRemove}
    />
  </div>
);

export default ChartSettingFieldPicker;
