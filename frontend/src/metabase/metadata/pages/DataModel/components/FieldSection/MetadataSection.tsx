import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Box,
  Stack,
  TextInputBlurChange,
  TextareaBlurChange,
} from "metabase/ui";
import type { DatabaseId, Field } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

export const MetadataSection = ({ databaseId, field }: Props) => {
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: databaseId,
  });
  const [updateField] = useUpdateFieldMutation();
  const id = getRawTableFieldId(field);

  return (
    <Stack gap="md">
      <Box>
        <SectionPill icon="database" title={t`Metadata`} />
      </Box>

      <TextInputBlurChange
        label={t`Display name`}
        normalize={(newValue) => {
          if (typeof newValue !== "string") {
            return field.display_name;
          }

          const isNewValueEmpty = newValue.trim().length === 0;
          return isNewValueEmpty ? field.display_name : newValue.trim();
        }}
        value={field.display_name}
        onBlurChange={(event) => {
          updateField({ id, display_name: event.target.value });
        }}
      />

      <TextareaBlurChange
        component="textarea"
        label={t`Description`}
        mih={80}
        styles={{
          input: {
            minHeight: 80,
          },
        }}
        placeholder={t`What is this field about?`}
        value={field.description ?? ""}
        onBlurChange={(event) => {
          const newValue = event.target.value;

          updateField({
            id,
            description: newValue.trim().length > 0 ? newValue : null,
          });
        }}
      />

      <SemanticTypeAndTargetPicker
        description={t`What this data represents`}
        field={field}
        idFields={idFields}
        label={t`Semantic type`}
        onUpdateField={(field, updates) => {
          const { id: _id, ...fieldAttributes } = field;
          const id = getRawTableFieldId(field);
          updateField({ id, ...fieldAttributes, ...updates });
        }}
      />
    </Stack>
  );
};
