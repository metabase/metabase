/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import { DatasetColumn } from "metabase-types/api";
import { ConcreteField, Field } from "metabase-types/types/Query";
import { isNotNull } from "metabase/core/utils/types";

import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";
import Dimension from "metabase-lib/Dimension";

import {
  TableHeaderContainer,
  TableName,
  FieldCheckbox,
} from "./ChartSettingColumnEditor.styled";

type ColumnSetting = {
  name?: string;
  fieldRef?: Field | null;
  enabled: boolean;
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
        dimensions: options.dimensions.filter(isNotNull),
        fks: options.fks.map(fk => ({
          name:
            fk.name ||
            (fk.field.target
              ? fk.field.target.table?.display_name
              : fk.field.displayName()),
          dimensions: fk.dimensions.filter(isNotNull),
        })),
      };
    } else if (query instanceof NativeQuery && columns) {
      return {
        name: query.table()?.display_name || t`Columns`,
        dimensions: columns
          .map(column => Dimension.parseMBQL(column.field_ref as ConcreteField))
          .filter(isNotNull),
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

  const getColumnSettingByDimension = (dimension: Dimension) => {
    return columnSettings.find(setting =>
      dimension.isSameBaseDimension(setting.fieldRef as ConcreteField),
    );
  };

  const columnIsEnabled = (dimension: Dimension) => {
    return getColumnSettingByDimension(dimension)?.enabled;
  };

  const toggleColumn = (dimension: Dimension) => {
    const setting = getColumnSettingByDimension(dimension);

    if (!setting?.enabled) {
      enableColumns([dimension]);
    } else {
      disableColumns([dimension]);
    }
  };

  const tableInColumnSettings = (dimensions: Dimension[]) => {
    return dimensions.some(
      dimension => getColumnSettingByDimension(dimension)?.enabled,
    );
  };

  const disableColumns = (dimensions: Dimension[]) => {
    const columnSettingsCopy = columnSettings.map(setting => ({
      ...setting,
      enabled: dimensions.some(dimension =>
        dimension.isSameBaseDimension(setting.fieldRef as ConcreteField),
      )
        ? false
        : setting.enabled,
    }));

    onChange(columnSettingsCopy);
  };

  const enableColumns = (dimensions: Dimension[]) => {
    const [dimensionsInColumnSettings, dimensionsNotInColumnSettings] =
      _.partition(
        dimensions,
        dimension => !!getColumnSettingByDimension(dimension),
      );

    //Enable any columns that are in column settings (used for Native Queries)
    const columnSettingsCopy = columnSettings.map(setting => ({
      ...setting,
      enabled: dimensionsInColumnSettings.some(dimension =>
        dimension.isSameBaseDimension(setting.fieldRef as ConcreteField),
      )
        ? true
        : setting.enabled,
    }));

    //Add any that are not in the ColumnSettings (used for Structured Queries)
    onChange([
      ...columnSettingsCopy,
      ...dimensionsNotInColumnSettings.map(dimension => ({
        fieldRef: dimension.mbql(),
        enabled: true,
      })),
    ]);
  };

  return (
    <div className="list">
      <TableHeaderContainer>
        <TableName>{fieldOptions.name}</TableName>
        <BulkActionButton
          tableInColumns={tableInColumnSettings(fieldOptions.dimensions)}
          bulkEnable={() => enableColumns(fieldOptions.dimensions)}
          bulkDisable={() => disableColumns(fieldOptions.dimensions)}
        />
      </TableHeaderContainer>
      {fieldOptions.dimensions.map((dimension, index) => (
        <FieldCheckbox
          label={dimension.displayName()}
          onClick={() => toggleColumn(dimension)}
          checked={columnIsEnabled(dimension)}
          key={`${dimension.displayName()}-${index}`}
        />
      ))}
      {fieldOptions.fks.length > 0 &&
        fieldOptions.fks.map(fk => (
          <>
            <TableHeaderContainer>
              <TableName>{fk.name}</TableName>
              <BulkActionButton
                tableInColumns={tableInColumnSettings(fk.dimensions)}
                bulkEnable={() => enableColumns(fk.dimensions)}
                bulkDisable={() => disableColumns(fk.dimensions)}
              />
            </TableHeaderContainer>
            {fk.dimensions.map((dimension, index) => (
              <FieldCheckbox
                label={dimension.displayName()}
                onClick={() => toggleColumn(dimension)}
                checked={columnIsEnabled(dimension)}
                key={`${fk.name}-${dimension.displayName()}-${index}`}
              />
            ))}
          </>
        ))}
    </div>
  );
};

interface BulkActionButtonProps {
  tableInColumns: boolean;
  bulkEnable: () => void;
  bulkDisable: () => void;
}

const BulkActionButton = ({
  tableInColumns,
  bulkEnable,
  bulkDisable,
}: BulkActionButtonProps) =>
  tableInColumns ? (
    <Button onlyText onClick={bulkDisable}>
      {t`Deselect All`}
    </Button>
  ) : (
    <Button onlyText onClick={bulkEnable}>
      {t`Select All`}
    </Button>
  );

export default ChartSettingColumnEditor;
