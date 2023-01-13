/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { findColumnForColumnSetting } from "metabase-lib/queries/utils/dataset";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/queries/NativeQuery";

import { getBaseDimensionReference } from "metabase-lib/references";

import {
  TableHeaderContainer,
  TableName,
  FieldCheckbox,
  FieldBulkActionLink,
} from "./ChartSettingColumnEditor.styled";

const ChartSettingColumnEditor = ({
  onChange,
  value: columnSettings,
  columns,
  question,
}) => {
  const fieldOptions = useMemo(() => {
    const query = question && question.query();
    if (query instanceof StructuredQuery) {
      const options = query.fieldsOptions();
      return {
        count: options.count,
        dimensions: options.dimensions.map(dimension => ({
          displayName: dimension.displayName(),
          fieldRef: dimension.mbql(),
        })),
        fks: options.fks,
      };
    } else if (query instanceof NativeQuery && columns) {
      return {
        count: columns.length,
        dimensions: columns.map(column => ({
          displayName: getFriendlyName(column),
          fieldRef: column.field_ref,
        })),
        fks: [],
      };
    } else
      return {
        count: 0,
        dimensions: [],
        fks: [],
      };
  }, [question, columns]);

  const handleEnable = mbql => {
    console.log("enabling column");
    const columnSettingsCopy = [...columnSettings];
    const index = getColumnSettingIndexByRef(mbql);
    columnSettingsCopy[index] = { ...columnSettingsCopy[index], enabled: true };
    onChange(columnSettingsCopy);
  };

  const handleDisable = mbql => {
    console.log("disabling column");
    const columnSettingsCopy = [...columnSettings];
    const index = getColumnSettingIndexByRef(mbql);
    columnSettingsCopy[index] = {
      ...columnSettingsCopy[index],
      enabled: false,
    };
    onChange(columnSettingsCopy);
  };

  const handleAddNewField = fieldRef => {
    console.log("adding new column", fieldRef);
    const columnSettingsCopy = [...columnSettings, { fieldRef, enabled: true }];
    onChange(columnSettingsCopy);
  };

  const getColumnName = columnSetting =>
    getFriendlyName(
      findColumnForColumnSetting(columns, columnSetting) || {
        display_name: "[Unknown]",
      },
    );

  const getColumnSettingByRef = mbql => {
    return columnSettings[getColumnSettingIndexByRef(mbql)];
  };

  const getColumnSettingIndexByRef = mbql => {
    return columnSettings.findIndex(setting =>
      _.isEqual(getBaseDimensionReference(setting.fieldRef), mbql),
    );
  };

  const columnIsEnabled = mbql => {
    return getColumnSettingByRef(mbql)?.enabled;
  };

  const toggleColumn = mbql => {
    const setting = getColumnSettingByRef(mbql);

    if (!setting) {
      handleAddNewField(mbql);
    } else if (setting.enabled) {
      handleDisable(mbql);
    } else if (!setting.enabled) {
      handleEnable(mbql);
    }
  };

  const tableInColumnSettings = dimensions => {
    return dimensions.some(
      dimension => getColumnSettingByRef(dimension.fieldRef)?.enabled,
    );
  };

  const bulkDisableColumns = dimensions => {
    const columnSettingsCopy = columnSettings.map(setting => ({
      ...setting,
      enabled: dimensions.some(dimension =>
        _.isEqual(
          getBaseDimensionReference(setting.fieldRef),
          dimension.fieldRef,
        ),
      )
        ? false
        : setting.enabled,
    }));

    onChange(columnSettingsCopy);
  };

  const bulkEnableColumns = dimensions => {
    const [dimensionsInColumnSettings, dimensionsNotInColumnSettings] =
      _.partition(dimensions, dimension =>
        getColumnSettingByRef(dimension.fieldRef),
      );

    //Enable any columns that are in column settings
    const columnSettingsCopy = columnSettings.map(setting => ({
      ...setting,
      enabled: dimensionsInColumnSettings.some(dimension =>
        _.isEqual(
          getBaseDimensionReference(setting.fieldRef),
          dimension.fieldRef,
        ),
      )
        ? true
        : setting.enabled,
    }));

    console.log(dimensionsNotInColumnSettings);
    //Add any that are not in the ColumnSettings
    onChange([
      ...columnSettingsCopy,
      ...dimensionsNotInColumnSettings.map(dimension => ({
        fieldRef: dimension.fieldRef,
        enabled: true,
      })),
    ]);
  };

  return (
    <div className="list">
      <TableHeaderContainer>
        <TableName>
          {question.query().table()?.display_name || t`Columns`}
        </TableName>
        {tableInColumnSettings(fieldOptions.dimensions) ? (
          <FieldBulkActionLink
            as="button"
            onClick={() => bulkDisableColumns(fieldOptions.dimensions)}
          >
            {t`Deselect All`}
          </FieldBulkActionLink>
        ) : (
          <FieldBulkActionLink
            as="button"
            onClick={() => bulkEnableColumns(fieldOptions.dimensions)}
          >
            {t`Select All`}
          </FieldBulkActionLink>
        )}
      </TableHeaderContainer>
      {fieldOptions.dimensions.map(dimension => (
        <FieldCheckbox
          label={dimension.displayName}
          onClick={() => toggleColumn(dimension.fieldRef)}
          checked={columnIsEnabled(dimension.fieldRef)}
        />
      ))}
      {fieldOptions.fks.length > 0 && (
        <>
          {fieldOptions.fks.map(fk => (
            <>
              <TableHeaderContainer>
                <TableName>
                  {fk.name ||
                    (fk.field.target
                      ? fk.field.target.table.display_name
                      : fk.field.display_name)}
                </TableName>
              </TableHeaderContainer>
              {fk.dimensions.map(dimension => (
                <FieldCheckbox
                  label={dimension.displayName()}
                  onClick={() => toggleColumn(dimension.mbql())}
                  checked={columnIsEnabled(dimension.mbql())}
                />
              ))}
            </>
          ))}
        </>
      )}
    </div>
  );
};

export default ChartSettingColumnEditor;
