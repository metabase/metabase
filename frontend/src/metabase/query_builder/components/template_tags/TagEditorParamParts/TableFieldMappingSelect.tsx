import { t } from "ttag";

import { FieldDataSelector } from "metabase/query_builder/components/DataSelector";
import type Database from "metabase-lib/v1/metadata/Database";
import type { FieldId, TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

export function TableFieldMappingSelect({
  tag,
  database,
  databases,
  onChange,
}: {
  tag: TemplateTag;
  database?: Database | null;
  databases: Database[];
  onChange: (fieldId: FieldId) => void;
}) {
  const tableId = tag["table-id"];

  return (
    <InputContainer>
      <ContainerLabel>{t`Field to partition by`}</ContainerLabel>

      {tableId != null && (
        <FieldDataSelector
          databases={databases}
          selectedDatabase={database || null}
          selectedDatabaseId={database?.id || null}
          selectedTable={tableId}
          selectedTableId={tableId}
          setFieldFn={onChange}
          isMantine
        />
      )}
    </InputContainer>
  );
}
