import { t } from "ttag";

import type { WritebackQueryAction } from "metabase-types/api";

import { ActionFieldsContent } from "./ActionFieldsContent";
import { useQueryActionFields } from "./hooks";

type QueryActionFieldsContentProps = {
  action: WritebackQueryAction;
  fieldId: string | undefined;
  canChangeFieldType: boolean;
  getFieldsUrl: (fieldId?: string) => string;
};

export function QueryActionFieldsContent({
  action,
  fieldId,
  canChangeFieldType,
  getFieldsUrl,
}: QueryActionFieldsContentProps) {
  const { fields, updateField, reorderFields } = useQueryActionFields(action);
  const readOnly = !action.can_write;
  const canReorder = !readOnly && fields.length > 1;

  return (
    <ActionFieldsContent
      fields={fields}
      fieldId={fieldId}
      description={getFieldsDescription(fields.length, canReorder)}
      canReorder={canReorder}
      canChangeSettings={!readOnly}
      canChangeFieldType={!readOnly && canChangeFieldType}
      canChangeVisibility={!readOnly}
      getFieldsUrl={getFieldsUrl}
      onUpdateField={updateField}
      onReorderFields={reorderFields}
    />
  );
}

function getFieldsDescription(fieldCount: number, canReorder: boolean) {
  if (fieldCount === 0) {
    return t`This action has no variables in its SQL.`;
  }
  return canReorder
    ? t`One field per {{variable}} in the SQL. Drag to reorder the form.`
    : t`One field per {{variable}} in the SQL.`;
}
