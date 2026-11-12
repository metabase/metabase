import { t } from "ttag";

import { SchemaTableAndFieldDataSelector } from "metabase/querying/common/components/DataSelector";
import { Text } from "metabase/ui";
import { type FieldTypeInfo, isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  DatabaseId,
  Field,
  FieldId,
  TemplateTag,
} from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

export function FieldMappingSelect({
  tag,
  field,
  databaseId,
  setFieldFn,
}: {
  tag: TemplateTag;
  databaseId: DatabaseId | null;
  field: Field | undefined;
  setFieldFn: (fieldId: FieldId) => void;
}) {
  const fieldId = tag["field-id"];

  return (
    <InputContainer>
      <ContainerLabel>
        {t`Field to map to`}
        {fieldId == null && (
          <Text c="feedback-negative" component="span" ml="xxs">
            {t`(required)`}
          </Text>
        )}
      </ContainerLabel>

      {(fieldId == null || field != null) && (
        <SchemaTableAndFieldDataSelector
          selectedDatabaseId={databaseId}
          selectedTableId={field?.table_id ?? null}
          selectedFieldId={fieldId ?? null}
          setFieldFn={setFieldFn}
          fieldFilter={getFieldFilter(tag)}
          isInitiallyOpen={fieldId == null}
        />
      )}
    </InputContainer>
  );
}

function getFieldFilter(tag: TemplateTag) {
  if (tag.type === "temporal-unit") {
    return (field: FieldTypeInfo) => isDate(field);
  }
}
