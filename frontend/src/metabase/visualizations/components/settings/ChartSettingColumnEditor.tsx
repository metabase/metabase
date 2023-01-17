/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getFriendlyName } from "metabase/visualizations/lib/utils";

import { DatasetColumn } from "metabase-types/api";
import { DimensionReferenceWithOptions } from "metabase-types/api/query";

import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import { getBaseDimensionReference } from "metabase-lib/references";
import Question from "metabase-lib/Question";

import {
  TableHeaderContainer,
  TableName,
  FieldCheckbox,
  FieldBulkActionLink,
} from "./ChartSettingColumnEditor.styled";

type ColumnSetting = {
  name?: string;
  fieldRef: DimensionReferenceWithOptions;
  enabled: boolean;
};

type ColumnDimension = {
  displayName: string;
  fieldRef: DimensionReferenceWithOptions;
};
interface ChartSettingColumnEditorProps {
  value: ColumnSetting[];
  onChange: (val: ColumnSetting[]) => void;
  columns: DatasetColumn[];
  question: Question;
}

const ChartSettingColumnEditor = ({
  onChange,
  value: columnSettings,
  columns,
  question,
}: ChartSettingColumnEditorProps) => {
  const fieldOptions = useMemo(() => {
    const query = question && question.query();
    if (query instanceof StructuredQuery) {
      const options = query.fieldsOptions();
      return {
        name: query.table()?.display_name || t`Columns`,
        dimensions: options.dimensions.map(dimension => ({
          displayName: dimension.displayName(),
          fieldRef: dimension.mbql(),
        })) as ColumnDimension[],
        fks: options.fks.map(fk => ({
          name:
            fk.name ||
            (fk.field.target
              ? fk.field.target.table?.display_name
              : fk.field.displayName()),
          dimensions: fk.dimensions.map(dimension => ({
            displayName: dimension.displayName(),
            fieldRef: dimension.mbql(),
          })) as ColumnDimension[],
        })),
      };
    } else if (query instanceof NativeQuery && columns) {
      return {
        name: query.table()?.display_name || t`Columns`,
        dimensions: columns.map(column => ({
          displayName: getFriendlyName(column),
          fieldRef: column.field_ref,
        })) as ColumnDimension[],
        fks: [],
      };
    } else {
      return {
        count: 0,
        dimensions: [],
        fks: [],
      };
    }
  }, [question, columns]);

  const handleEnable = (mbql: DimensionReferenceWithOptions) => {
    const columnSettingsCopy = [...columnSettings];
    const index = getColumnSettingIndexByRef(mbql);
    columnSettingsCopy[index] = { ...columnSettingsCopy[index], enabled: true };
    onChange(columnSettingsCopy);
  };

  const handleDisable = (mbql: DimensionReferenceWithOptions) => {
    const columnSettingsCopy = [...columnSettings];
    const index = getColumnSettingIndexByRef(mbql);
    columnSettingsCopy[index] = {
      ...columnSettingsCopy[index],
      enabled: false,
    };
    onChange(columnSettingsCopy);
  };

  const handleAddNewField = (fieldRef: DimensionReferenceWithOptions) => {
    const columnSettingsCopy = [...columnSettings, { fieldRef, enabled: true }];
    onChange(columnSettingsCopy);
  };

  const getColumnSettingByRef = (mbql: DimensionReferenceWithOptions) => {
    return columnSettings[getColumnSettingIndexByRef(mbql)];
  };

  const getColumnSettingIndexByRef = (mbql: DimensionReferenceWithOptions) => {
    return columnSettings.findIndex(setting =>
      _.isEqual(getBaseDimensionReference(setting.fieldRef), mbql),
    );
  };

  const columnIsEnabled = (mbql: DimensionReferenceWithOptions) => {
    console.log(mbql, columnSettings);
    return getColumnSettingByRef(mbql)?.enabled;
  };

  const toggleColumn = (mbql: DimensionReferenceWithOptions) => {
    const setting = getColumnSettingByRef(mbql);

    if (!setting) {
      handleAddNewField(mbql);
    } else if (setting.enabled) {
      handleDisable(mbql);
    } else if (!setting.enabled) {
      handleEnable(mbql);
    }
  };

  const tableInColumnSettings = (dimensions: ColumnDimension[]) => {
    return dimensions.some(
      dimension => getColumnSettingByRef(dimension.fieldRef)?.enabled,
    );
  };

  const bulkDisableColumns = (dimensions: ColumnDimension[]) => {
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

  const bulkEnableColumns = (dimensions: ColumnDimension[]) => {
    const [dimensionsInColumnSettings, dimensionsNotInColumnSettings] =
      _.partition(
        dimensions,
        dimension => !!getColumnSettingByRef(dimension.fieldRef),
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
        <TableName>{fieldOptions.name}</TableName>
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
      {fieldOptions.dimensions.map((dimension, index) => (
        <FieldCheckbox
          label={dimension.displayName}
          onClick={() => toggleColumn(dimension.fieldRef)}
          checked={columnIsEnabled(dimension.fieldRef)}
          key={`${dimension.displayName}-${index}`}
        />
      ))}
      {fieldOptions.fks.length > 0 &&
        fieldOptions.fks.map(fk => (
          <>
            <TableHeaderContainer>
              <TableName>{fk.name}</TableName>
              {tableInColumnSettings(fk.dimensions) ? (
                <FieldBulkActionLink
                  as="button"
                  onClick={() => bulkDisableColumns(fk.dimensions)}
                >
                  {t`Deselect All`}
                </FieldBulkActionLink>
              ) : (
                <FieldBulkActionLink
                  as="button"
                  onClick={() => bulkEnableColumns(fk.dimensions)}
                >
                  {t`Select All`}
                </FieldBulkActionLink>
              )}
            </TableHeaderContainer>
            {fk.dimensions.map((dimension, index) => (
              <FieldCheckbox
                label={dimension.displayName}
                onClick={() => toggleColumn(dimension.fieldRef)}
                checked={columnIsEnabled(dimension.fieldRef)}
                key={`${fk.name}-${dimension.displayName}-${index}`}
              />
            ))}
          </>
        ))}
    </div>
  );
};

export default ChartSettingColumnEditor;
