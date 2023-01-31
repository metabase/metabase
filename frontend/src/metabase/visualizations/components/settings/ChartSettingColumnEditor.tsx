import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import { DatasetColumn } from "metabase-types/api";
import { ConcreteField, Field } from "metabase-types/types/Query";
import { isNotNull } from "metabase/core/utils/types";

import Metadata from "metabase-lib/metadata/Metadata";
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
  isDashboard?: boolean;
  metadata?: Metadata;
  isQueryRunning: boolean;
}

const structuredQueryFieldOptions = (
  query: StructuredQuery,
  columns: DatasetColumn[],
) => {
  const options = query.fieldsOptions();
  const allFields = options.dimensions.concat(
    options.fks.reduce(
      (memo, fk) => memo.concat(fk.dimensions),
      [] as Dimension[],
    ),
  );
  const missingDimensions = columns
    .filter(
      column =>
        !allFields.some(dimension =>
          dimension.isSameBaseDimension(column.field_ref as ConcreteField),
        ),
    )
    .map(column =>
      Dimension.parseMBQL(
        column.field_ref as ConcreteField,
        query.metadata(),
        query,
      ),
    )
    .filter(isNotNull);
  return {
    name: query.table()?.display_name || t`Columns`,
    dimensions: options.dimensions.concat(missingDimensions).filter(isNotNull),
    fks: options.fks.map(fk => ({
      name:
        fk.name ||
        (fk.field.target
          ? fk.field.target.table?.display_name
          : fk.field.displayName()),
      dimensions: fk.dimensions.filter(isNotNull),
    })),
  };
};

const nativeQueryFieldOptions = (
  columns: DatasetColumn[],
  metadata?: Metadata,
) => {
  const allDimensions = columns
    .map(column =>
      Dimension.parseMBQL(column.field_ref as ConcreteField, metadata),
    )
    .filter(isNotNull);

  const groupedDimensions = _.groupBy(
    allDimensions,
    dimension => dimension.field().table?.displayName() || t`Columns`,
  );
  const tables = Object.keys(groupedDimensions);
  const firstTable = tables[0];
  return {
    name: firstTable,
    dimensions: groupedDimensions[firstTable],
    fks: tables
      .filter(table => table !== firstTable)
      .map(table => ({
        name: table,
        dimensions: groupedDimensions[table],
      })),
  };
};

const ChartSettingColumnEditor = ({
  onChange,
  value: columnSettings,
  columns,
  question,
  isDashboard,
  metadata,
  isQueryRunning,
}: ChartSettingColumnEditorProps) => {
  const fieldOptions = useMemo(() => {
    const query = question && question.query();
    if (query instanceof StructuredQuery && !isDashboard) {
      return structuredQueryFieldOptions(query, columns);
    } else if ((query instanceof NativeQuery || isDashboard) && columns) {
      return nativeQueryFieldOptions(columns, metadata);
    } else {
      return {
        name: "",
        dimensions: [],
        fks: [],
      };
    }
  }, [question, columns, isDashboard, metadata]);

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
          testid={`bulk-action-${fieldOptions.name}`}
        />
      </TableHeaderContainer>
      {fieldOptions.dimensions.map((dimension, index) => (
        <FieldCheckbox
          label={dimension.displayName()}
          onClick={() => toggleColumn(dimension)}
          checked={columnIsEnabled(dimension)}
          key={`${dimension.displayName()}-${index}`}
          disabled={isQueryRunning}
        />
      ))}
      {fieldOptions.fks.map(fk => (
        <>
          <TableHeaderContainer>
            <TableName>{fk.name}</TableName>
            <BulkActionButton
              tableInColumns={tableInColumnSettings(fk.dimensions)}
              bulkEnable={() => enableColumns(fk.dimensions)}
              bulkDisable={() => disableColumns(fk.dimensions)}
              testid={`bulk-action-${fk.name}`}
            />
          </TableHeaderContainer>
          {fk.dimensions.map((dimension, index) => (
            <FieldCheckbox
              label={dimension.displayName()}
              onClick={() => toggleColumn(dimension)}
              checked={columnIsEnabled(dimension)}
              key={`${fk.name}-${dimension.displayName()}-${index}`}
              disabled={isQueryRunning}
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
  testid: string;
}

const BulkActionButton = ({
  tableInColumns,
  bulkEnable,
  bulkDisable,
  testid,
}: BulkActionButtonProps) =>
  tableInColumns ? (
    <Button onlyText onClick={bulkDisable} data-testid={testid}>
      {t`Deselect All`}
    </Button>
  ) : (
    <Button onlyText onClick={bulkEnable} data-testid={testid}>
      {t`Select All`}
    </Button>
  );

export default ChartSettingColumnEditor;
