import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Stack, TextInputBlurChange } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

interface Props {
  field: Field;
  table: Table;
}

export const MetadataSection = ({ field, table }: Props) => {
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

      <SemanticTypeAndTargetPicker
        field={field}
        // idFields={idFields}
        table={table}
        // onUpdateField={onUpdateField}
      />
    </Stack>
  );
};
