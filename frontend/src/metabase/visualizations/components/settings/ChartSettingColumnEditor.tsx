/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import CheckBox from "metabase/core/components/CheckBox";

import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import {
  findColumnForColumnSetting,
  findColumnSettingForColumn,
  findColumnSettingIndexForColumn,
} from "metabase-lib/queries/utils/dataset";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

const ChartSettingColumnEditor = ({
  onChange,
  value: columnSettings,
  columns,
  question,
}) => {
  const handleEnable = (columnSetting, index) => {
    const columnSettingsCopy = [...columnSettings];
    columnSettingsCopy[index] = { ...columnSettingsCopy[index], enabled: true };
    onChange(columnSettingsCopy);
  };

  const handleDisable = (columnSetting, index) => {
    const columnSettingsCopy = [...columnSettings];
    columnSettingsCopy[index] = {
      ...columnSettingsCopy[index],
      enabled: false,
    };
    onChange(columnSettingsCopy);
  };

  const handleAddNewField = fieldRef => {
    const columnSettings = [...columnSettings, { fieldRef, enabled: true }];
    onChange(columnSettings);
  };

  const getColumnName = columnSetting =>
    getFriendlyName(
      findColumnForColumnSetting(columns, columnSetting) || {
        display_name: "[Unknown]",
      },
    );

  const query = question && question.query();

  let additionalFieldOptions = { count: 0 };
  if (columns && query instanceof StructuredQuery) {
    additionalFieldOptions = query.fieldsOptions(dimension => {
      return !_.find(columns, column =>
        dimension.isSameBaseDimension(column.field_ref),
      );
    });
  }

  // const [enabledColumns, disabledColumns] = _.partition(
  //   value
  //     .filter(columnSetting =>
  //       findColumnForColumnSetting(columns, columnSetting),
  //     )
  //     .map((columnSetting, index) => ({ ...columnSetting, index })),
  //   columnSetting => columnSetting.enabled,
  // );

  console.log(columnSettings);
  console.log(columns);

  const columnIsEnabled = columnSetting => {
    return columnSetting?.enabled;
  };

  const toggleColumn = (columnSetting, settingIndex) => {
    const setting = columnSettings[settingIndex];
    if (setting.enabled) {
      handleDisable(setting, settingIndex);
    } else {
      handleEnable(setting, settingIndex);
    }
  };

  return (
    <div className="list">
      <h4>{query.table().display_name}</h4>
      {columnSettings.map((columnSetting, settingIndex) => (
        <CheckBox
          label={getColumnName(columnSetting)}
          checked={columnIsEnabled(columnSetting)}
          onClick={() => toggleColumn(columnSetting, settingIndex)}
        />
      ))}
      {additionalFieldOptions.count > 0 && (
        <>
          {additionalFieldOptions.dimensions.map(dimension => (
            <CheckBox
              label={dimension.displayName()}
              onClick={() => handleAddNewField(dimension.mbql())}
            />
          ))}
          {additionalFieldOptions.fks.map(fk => (
            <>
              <h4>
                {fk.name ||
                  (fk.field.target
                    ? fk.field.target.table.display_name
                    : fk.field.display_name)}
              </h4>
              {fk.dimensions.map(dimension => (
                <CheckBox label={dimension.displayName()} />
              ))}
            </>
          ))}
        </>
      )}
    </div>
  );
};

export default ChartSettingColumnEditor;
