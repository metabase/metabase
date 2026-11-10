import { t } from "ttag";

import type { WritebackHttpAction } from "metabase-types/api";

import { ActionFieldsContent } from "./ActionFieldsContent";
import { useHttpActionFields } from "./hooks";

type HttpActionFieldsContentProps = {
  action: WritebackHttpAction;
  fieldId: string | undefined;
  getFieldsUrl: (fieldId?: string) => string;
};

export function HttpActionFieldsContent({
  action,
  fieldId,
  getFieldsUrl,
}: HttpActionFieldsContentProps) {
  const { fields, updateField, reorderFields } = useHttpActionFields(action);
  const readOnly = !action.can_write;
  const canReorder = !readOnly && fields.length > 1;

  return (
    <ActionFieldsContent
      fields={fields}
      fieldId={fieldId}
      description={getFieldsDescription(fields.length, canReorder)}
      canReorder={canReorder}
      canChangeSettings={!readOnly}
      canChangeFieldType={!readOnly}
      canChangeVisibility={!readOnly}
      getFieldsUrl={getFieldsUrl}
      onUpdateField={updateField}
      onReorderFields={reorderFields}
    />
  );
}

function getFieldsDescription(fieldCount: number, canReorder: boolean) {
  if (fieldCount === 0) {
    return t`This action has no variables in its request.`;
  }
  return canReorder
    ? t`One field per {{variable}} in the request. Drag to reorder the form.`
    : t`One field per {{variable}} in the request.`;
}
