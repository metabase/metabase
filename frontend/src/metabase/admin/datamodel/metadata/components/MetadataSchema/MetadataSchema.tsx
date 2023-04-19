import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import { Field, Table } from "metabase-types/api";
import {
  ColumnNameCell,
  DataTypeCell,
  HeaderCell,
} from "./MetadataSchema.styled";

interface MetadataSchemaProps {
  table: Table;
}

const MetadataSchema = ({ table }: MetadataSchemaProps) => {
  const rootFields = useMemo(() => {
    return table.fields?.filter(field => field.nfc_path === null) ?? [];
  }, [table]);

  const fieldByParent = useMemo(() => {
    return _.groupBy(table.fields ?? [], field => field.nfc_path?.[0] ?? "");
  }, [table]);

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
          {rootFields.map(field => {
            const nestedFields = fieldByParent[field.name] ?? [];

            return (
              <React.Fragment key={field.id}>
                <FieldRow field={field} isBordered={nestedFields.length > 0} />
                {nestedFields.map((field, index) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    isBordered={index < nestedFields.length - 1}
                    isSecondary
                  />
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

interface FieldRowProps {
  field: Field;
  isBordered?: boolean;
  isSecondary?: boolean;
}

const FieldRow = ({ field, isBordered, isSecondary }: FieldRowProps) => (
  <tr>
    <ColumnNameCell
      data-testid="table-name"
      isBordered={isBordered}
      isSecondary={isSecondary}
    >
      {field.name}
    </ColumnNameCell>
    <DataTypeCell isBordered={isBordered}>{field.base_type}</DataTypeCell>
    <DataTypeCell isBordered={isBordered} />
  </tr>
);

export default MetadataSchema;
