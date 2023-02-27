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
import AtomicQuery from "metabase-lib/queries/AtomicQuery";
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
  getCustomColumnName: (val: DatasetColumn, onlyCustom: boolean) => string;
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

  console.log(allFields.map(f => f.column()));
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

  console.log(missingDimensions.map(f => f.column()));
  return {
    name: query.sourceTable()?.display_name || t`Columns`,
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
  query?: AtomicQuery,
) => {
  const allDimensions = columns
    .map(column =>
      Dimension.parseMBQL(column.field_ref as ConcreteField, metadata),
    )
    .filter(isNotNull);

  return {
    name: query?.sourceTable()?.displayName() || t`Columns`,
    dimensions: allDimensions,
    fks: [],
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
  getCustomColumnName,
}: ChartSettingColumnEditorProps) => {
  const fieldOptions = useMemo(() => {
    const query = question && question.query();
    if ((query instanceof NativeQuery || isDashboard) && columns) {
      return nativeQueryFieldOptions(
        columns,
        metadata || query.metadata(),
        query,
      );
    } else if (query instanceof StructuredQuery) {
      return structuredQueryFieldOptions(query, columns);
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

  const getColumnByDimension = (dimension: Dimension) => {
    return columns.find(column =>
      dimension.isSameBaseDimension(column.field_ref as ConcreteField),
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

  const getDimensionLabel = (dimension: Dimension, sourceTable = true) => {
    const column = getColumnByDimension(dimension);

    // When we have a colum returned, we want to use that display name as long as it's part of the source table
    // This ensures that we get the {table}→{column} syntax when appropriate. On anything other than the
    // Source table, there should be a table header above the list so we should only show the field name.
    if (column) {
      return (
        getCustomColumnName(column, !sourceTable) || dimension.displayName()
      );
    }

    return dimension.displayName();
  };

  return (
    <div>
      <div data-testid={`${fieldOptions.name}-columns`}>
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
            label={getDimensionLabel(dimension)}
            onClick={() => toggleColumn(dimension)}
            checked={columnIsEnabled(dimension)}
            key={`${dimension.displayName()}-${index}`}
            disabled={isQueryRunning}
          />
        ))}
      </div>
      {fieldOptions.fks.map(fk => (
        <div data-testid={`${fk.name}-columns`} key={`${fk.name}-columns`}>
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
              label={getDimensionLabel(dimension, false)}
              onClick={() => toggleColumn(dimension)}
              checked={columnIsEnabled(dimension)}
              key={`${fk.name}-${dimension.displayName()}-${index}`}
              disabled={isQueryRunning}
            />
          ))}
        </div>
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
