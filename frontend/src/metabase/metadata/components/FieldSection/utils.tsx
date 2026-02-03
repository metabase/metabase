import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isEntityName } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

export function getSemanticTypeError(
  table: Table,
  field: Field,
  getFieldHref: (fieldId: FieldId) => string,
): ReactNode | undefined {
  if (!isEntityName(field)) {
    return undefined;
  }

  const id = getRawTableFieldId(field);

  const entityNameFields =
    table.fields?.filter(
      (field) => isEntityName(field) && getRawTableFieldId(field) !== id,
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
        const href = getFieldHref(getRawTableFieldId(field));

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
