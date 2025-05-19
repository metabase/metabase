import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
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
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [updateField] = useUpdateFieldMutation();
  const id = getRawTableFieldId(field);
  const [sendToast] = useToast();
  function confirm(message: string) {
    sendToast({ message, icon: "check" });
  }

  return (
    <Stack gap="md">
      <Box>
        <SectionPill icon="model" title={t`Metadata`} />
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
        onBlurChange={async (event) => {
          await updateField({ id, display_name: event.target.value });
          confirm(t`Display name for ${event.target.value} updated`);
        }}
      />

      <TextareaBlurChange
        label={t`Description`}
        minRows={3}
        placeholder={t`What is this field about?`}
        value={field.description ?? ""}
        onBlurChange={async (event) => {
          const newValue = event.target.value;

          await updateField({
            id,
            description: newValue.trim().length > 0 ? newValue : null,
          });
          confirm(t`Description for ${field.display_name} updated`);
        }}
      />

      <SemanticTypeAndTargetPicker
        description={t`What this data represents`}
        field={field}
        idFields={idFields}
        label={t`Semantic type`}
        onUpdateField={async (field, updates) => {
          const { id: _id, ...fieldAttributes } = field;
          const id = getRawTableFieldId(field);
          await updateField({ id, ...fieldAttributes, ...updates });
          confirm(t`Semantic type for ${field.display_name} updated`);
        }}
      />
    </Stack>
  );
};
