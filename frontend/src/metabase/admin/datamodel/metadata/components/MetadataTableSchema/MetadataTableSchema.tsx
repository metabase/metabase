import cx from "classnames";
import { Fragment, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";

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
    <div className={cx(CS.mt3, CS.full)}>
      <table className={cx(CS.mt2, CS.full)}>
        <thead className={cx(CS.textUppercase, CS.textMedium, CS.py1)}>
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
              <Fragment key={index}>
                <ColumnRow field={field} isBordered={nestedFields.length > 0} />
                {nestedFields.map((field, index) => (
                  <ColumnRow
                    key={index}
                    field={field}
                    isBordered={index < nestedFields.length - 1}
                    isSecondary
                  />
                ))}
              </Fragment>
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
