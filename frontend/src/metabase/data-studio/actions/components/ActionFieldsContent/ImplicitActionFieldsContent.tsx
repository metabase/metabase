import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import type { WritebackImplicitQueryAction } from "metabase-types/api";

import { ActionFieldsContent } from "./ActionFieldsContent";
import { useImplicitActionFields } from "./hooks";

type ImplicitActionFieldsContentProps = {
  action: WritebackImplicitQueryAction;
  fieldId: string | undefined;
  getFieldsUrl: (fieldId?: string) => string;
};

export function ImplicitActionFieldsContent({
  action,
  fieldId,
  getFieldsUrl,
}: ImplicitActionFieldsContentProps) {
  const { fields, updateField, reorderFields } =
    useImplicitActionFields(action);
  const { data: table } = useGetTableQuery(
    action.table_id != null ? { id: action.table_id } : skipToken,
  );

  return (
    <ActionFieldsContent
      fields={fields}
      fieldId={fieldId}
      description={getFieldsDescription(fields.length, table?.display_name)}
      canReorder={false}
      canChangeSettings={false}
      canChangeFieldType={false}
      canChangeVisibility={action.can_write ?? false}
      getFieldsUrl={getFieldsUrl}
      onUpdateField={updateField}
      onReorderFields={reorderFields}
    />
  );
}

function getFieldsDescription(fieldCount: number, tableName = "") {
  return fieldCount === 0
    ? t`${tableName} has no columns this action can write.`
    : t`One field per column of ${tableName}.`;
}
