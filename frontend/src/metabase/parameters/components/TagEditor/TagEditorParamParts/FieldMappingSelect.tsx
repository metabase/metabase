import { t } from "ttag";

import { SchemaTableAndFieldDataSelector } from "metabase/querying/common/components/DataSelector";
import { Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import { type FieldTypeInfo, isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

export function FieldMappingSelect({
  tag,
  field,
  database,
  databases,
  setFieldFn,
}: {
  tag: TemplateTag;
  database?: Database | null;
  databases: Database[];
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
          databases={databases}
          selectedDatabaseId={database?.id || null}
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
