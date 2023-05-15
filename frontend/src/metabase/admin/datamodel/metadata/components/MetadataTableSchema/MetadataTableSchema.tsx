import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import Field from "metabase-lib/metadata/Field";
import Table from "metabase-lib/metadata/Table";
import {
  ColumnNameCell,
  DataTypeCell,
  HeaderCell,
} from "./MetadataTableSchema.styled";

interface MetadataTableSchemaProps {
  table: Table;
}

const MetadataTableSchema = ({ table }: MetadataTableSchemaProps) => {
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
          {rootFields.map((field, index) => {
            const nestedFields = fieldByParent[field.name] ?? [];

            return (
              <React.Fragment key={index}>
                <ColumnRow field={field} isBordered={nestedFields.length > 0} />
                {nestedFields.map((field, index) => (
                  <ColumnRow
                    key={index}
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

interface ColumnRowProps {
  field: Field;
  isBordered?: boolean;
  isSecondary?: boolean;
}

const ColumnRow = ({ field, isBordered, isSecondary }: ColumnRowProps) => (
  <tr>
    <ColumnNameCell
      data-testid="field-name"
      isBordered={isBordered}
      isSecondary={isSecondary}
    >
      {field.name}
    </ColumnNameCell>
    <DataTypeCell isBordered={isBordered}>{field.base_type}</DataTypeCell>
    <DataTypeCell isBordered={isBordered} />
  </tr>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataTableSchema;
