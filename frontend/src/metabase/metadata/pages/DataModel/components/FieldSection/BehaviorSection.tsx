import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { FieldVisibilityPicker } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Stack } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

interface Props {
  field: Field;
}

export const BehaviorSection = ({ field }: Props) => {
  const [updateField] = useUpdateFieldMutation();
  const id = getRawTableFieldId(field);

  return (
    <Stack gap="md">
      <Box>
        <SectionPill icon="filter" title={t`Behavior`} />

        <FieldVisibilityPicker
          value={field.visibility_type}
          onChange={(visibilityType) => {
            updateField({
              id,
              visibility_type: visibilityType,
            });
          }}
        />
      </Box>
    </Stack>
  );
};
