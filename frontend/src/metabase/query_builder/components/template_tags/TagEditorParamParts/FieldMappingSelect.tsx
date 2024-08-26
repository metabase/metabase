import { t } from "ttag";

import Schemas from "metabase/entities/schemas";
import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";
import { Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
import type { FieldId, TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam.styled";

export function FieldMappingSelect({
  tag,
  hasSelectedDimensionField,
  table,
  field,
  fieldMetadataLoaded,
  database,
  databases,
  setFieldFn,
}: {
  tag: TemplateTag;
  hasSelectedDimensionField: boolean;
  fieldMetadataLoaded: boolean;
  table: Table | null | undefined;
  database?: Database | null;
  databases: Database[];
  field: Field | null;
  setFieldFn: (fieldId: FieldId) => void;
}) {
  return (
    <InputContainer>
      <ContainerLabel>
        {t`Field to map to`}
        {tag.dimension == null && (
          <Text c="error" span={true} ml="sm">
            {t`(required)`}
          </Text>
        )}
      </ContainerLabel>

      {(!hasSelectedDimensionField ||
        (hasSelectedDimensionField && fieldMetadataLoaded)) && (
        <Schemas.Loader id={table?.schema?.id}>
          {() => (
            <SchemaTableAndFieldDataSelector
              databases={databases}
              selectedDatabase={database || null}
              selectedDatabaseId={database?.id || null}
              selectedTable={table || null}
              selectedTableId={table?.id || null}
              selectedField={field || null}
              selectedFieldId={
                hasSelectedDimensionField ? tag?.dimension?.[1] : null
              }
              setFieldFn={setFieldFn}
              isInitiallyOpen={!tag.dimension}
            />
          )}
        </Schemas.Loader>
      )}
    </InputContainer>
  );
}
