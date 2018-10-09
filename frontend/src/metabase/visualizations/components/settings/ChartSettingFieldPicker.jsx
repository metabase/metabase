import React from "react";

import { t } from "c-3po";
import cx from "classnames";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import ChartSettingSelect from "./ChartSettingSelect.jsx";

import { keyForColumn } from "metabase/lib/dataset";

const ChartSettingFieldPicker = ({
  value,
  options,
  onChange,
  onRemove,
  onShowWidget,
  className,
  columns,
  showColumnSetting,
}) => {
  let columnKey;
  if (value && showColumnSetting && columns) {
    const column = _.findWhere(columns, { name: value });
    if (column) {
      columnKey = keyForColumn(column);
    }
  }
  return (
    <div className={cx(className, "flex align-center")}>
      <ChartSettingSelect
        value={value}
        options={options}
        onChange={onChange}
        placeholder={t`Select a field`}
        placeholderNoOptions={t`No valid fields`}
        isInitiallyOpen={value === undefined}
      />
      {columnKey && (
        <Icon
          name="gear"
          className="ml1 text-medium text-brand-hover cursor-pointer"
          onClick={() => {
            onShowWidget({
              id: "column_settings",
              props: {
                initialKey: columnKey,
              },
            });
          }}
        />
      )}
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
};

export default ChartSettingFieldPicker;
