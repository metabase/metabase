import React from "react";
import { t } from "ttag";
import _ from "underscore";
import withTableMetadataLoaded from "metabase/admin/datamodel/hoc/withTableMetadataLoaded";
import Tables from "metabase/entities/tables";
import { Field, Table } from "metabase-types/api";
import { State } from "metabase-types/store";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import {
  ColumnNameCell,
  DataTypeCell,
  HeaderCell,
} from "./MetadataSchema.styled";
import { getFieldsTable } from "./utils";

interface FieldRowProps {
  field: Field;
  hideBorderBottom: boolean;
  isSecondary?: boolean;
}

const FieldRow = ({ field, hideBorderBottom, isSecondary }: FieldRowProps) => (
  <tr>
    <ColumnNameCell
      data-testid="table-name"
      isSecondary={isSecondary}
      hideBorderBottom={hideBorderBottom}
    >
      {field.name}
    </ColumnNameCell>
    <DataTypeCell hideBorderBottom={hideBorderBottom}>
      {field.base_type}
    </DataTypeCell>
    <DataTypeCell hideBorderBottom={hideBorderBottom} />
  </tr>
);

interface MetadataSchemaProps {
  table: Table;
}

const MetadataSchema = ({ table }: MetadataSchemaProps) => {
  if (!table || !table.fields) {
    return false;
  }

  const fields = getFieldsTable(table.fields);

  return (
    <div className="mt3 full">
      <table className="mt2 full">
        <thead className="text-uppercase text-medium py1">
          <tr>
            <HeaderCell>{t`Column`}</HeaderCell>
            <HeaderCell>{t`Data Type`}</HeaderCell>
            <HeaderCell>{t`Additional Info`}</HeaderCell>
          </tr>
        </thead>
        <tbody>
          {fields.map(field => {
            const hasNested = field.nested?.length > 0;

            return (
              <React.Fragment key={field.id}>
                <FieldRow field={field} hideBorderBottom={hasNested} />
                {field.nested?.map((nestedField, index) => {
                  const isLast = index === field.nested.length - 1;
                  return (
                    <FieldRow
                      key={nestedField.id}
                      field={nestedField}
                      hideBorderBottom={!isLast}
                      isSecondary
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default _.compose(
  Tables.load({
    id: (_state: State, { tableId }: { tableId: number }) => tableId,
    query: {
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    wrapped: true,
  }),
  withTableMetadataLoaded,
)(MetadataSchema);
