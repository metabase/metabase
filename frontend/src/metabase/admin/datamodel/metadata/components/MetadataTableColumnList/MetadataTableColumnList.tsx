import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
import type { SchemaId } from "metabase-types/api";

import MetadataTableColumn from "../MetadataTableColumn";

interface Props {
  table: Table;
  idFields: Field[];
  selectedSchemaId: SchemaId;
}

const getId = (field: Field) => field.getId();

export const MetadataTableColumnList = ({
  table,
  idFields,
  selectedSchemaId,
}: Props) => {
  const { fields = [], visibility_type } = table;
  const isHidden = visibility_type != null;

  const sortedFields = useMemo(
    () => _.sortBy(fields, (field) => field.position),
    [fields],
  );

  return (
    <div id="ColumnsList" className={cx(CS.mt3, { disabled: isHidden })}>
      <div className={cx(CS.textUppercase, CS.textMedium, CS.py1)}>
        <div className={CS.relative}>
          <div
            style={{ minWidth: 420 }}
            className={cx(CS.floatLeft, CS.px1)}
          >{t`Column`}</div>
          <div className={CS.flex}>
            <div className={cx(CS.flexHalf, CS.pl3)}>{t`Visibility`}</div>
            <div className={CS.flexHalf}>
              <span>{t`Type`}</span>
            </div>
          </div>
        </div>
      </div>
      <div>
        {sortedFields.map((field) => (
          <MetadataTableColumn
            key={getId(field)}
            field={field}
            idFields={idFields}
            selectedDatabaseId={table.db_id}
            selectedSchemaId={selectedSchemaId}
            selectedTableId={table.id}
          />
        ))}
      </div>
    </div>
  );
};
