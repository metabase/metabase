import { t } from "ttag";

import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";
import { Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldId, TemplateTag } from "metabase-types/api";

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
  field: Field | null;
  setFieldFn: (fieldId: FieldId) => void;
}) {
  const dimension = tag.dimension;

  return (
    <InputContainer>
      <ContainerLabel>
        {t`Field to map to`}
        {tag.dimension == null && (
          <Text c="error" component="span" ml="xs">
            {t`(required)`}
          </Text>
        )}
      </ContainerLabel>

      {(!dimension || (dimension && field != null)) && (
        <SchemaTableAndFieldDataSelector
          databases={databases}
          selectedDatabase={database || null}
          selectedDatabaseId={database?.id || null}
          selectedTable={field?.table || null}
          selectedTableId={field?.table?.id || null}
          selectedField={field || null}
          selectedFieldId={dimension ? dimension?.[1] : null}
          setFieldFn={setFieldFn}
          fieldFilter={getFieldFilter(tag)}
          isInitiallyOpen={!tag.dimension}
        />
      )}
    </InputContainer>
  );
}

function getFieldFilter(tag: TemplateTag) {
  if (tag.type === "temporal-unit") {
    return (field: Field) => field.isDate();
  }
}
