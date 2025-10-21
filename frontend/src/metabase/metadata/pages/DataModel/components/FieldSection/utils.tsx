import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import type { MetadataEditMode } from "metabase/metadata/pages/DataModel/types";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isEntityName } from "metabase-lib/v1/types/utils/isa";
import type {
  CollectionId,
  ConcreteTableId,
  Field,
  Table,
} from "metabase-types/api";

import { getUrl } from "../../utils";

export function getSemanticTypeError({
  table,
  field,
  mode,
  collectionId,
}: {
  table: Table;
  field: Field;
  mode: MetadataEditMode;
  collectionId: CollectionId | undefined;
}): ReactNode | undefined {
  if (!isEntityName(field)) {
    return undefined;
  }

  const entityNameFields =
    table.fields?.filter(
      mode === "table"
        ? (tableField) =>
            isEntityName(tableField) &&
            getRawTableFieldId(tableField) !== getRawTableFieldId(field)
        : (tableField) =>
            isEntityName(tableField) && tableField.name !== field.name,
    ) ?? [];

  if (entityNameFields.length === 0) {
    return undefined;
  }

  const fieldsByName = _.indexBy(table.fields ?? [], (field) => field.name);

  return (
    <>
      {t`There are other fields with this semantic type: `}

      {entityNameFields.map((field, index) => {
        const parentName = field.nfc_path?.[0] ?? "";
        const parentField = fieldsByName[parentName];
        const href =
          mode === "table"
            ? getUrl({
                databaseId: table.db_id,
                schemaName: table.schema,
                tableId: table.id,
                fieldId: getRawTableFieldId(field),
                collectionId: undefined,
                modelId: undefined,
                fieldName: undefined,
              })
            : getUrl({
                databaseId: undefined,
                schemaName: undefined,
                tableId: undefined,
                fieldId: undefined,
                collectionId: collectionId,
                modelId: table.id as ConcreteTableId,
                fieldName: field.name,
              });

        return (
          <Fragment key={index}>
            <Link to={href} style={{ textDecoration: "underline" }}>
              {parentField && (
                <>
                  {parentField.display_name}
                  {": "}
                </>
              )}

              {field.display_name}
            </Link>

            {index < entityNameFields.length - 1 && ", "}
          </Fragment>
        );
      })}
    </>
  );
}
