import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import {
  FieldValuesTypePicker,
  FieldVisibilityPicker,
} from "metabase/metadata/components";
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
      </Box>

      <FieldVisibilityPicker
        description={t`Where this field should be displayed`}
        label={t`Visibility`}
        value={field.visibility_type}
        onChange={(visibilityType) => {
          updateField({
            id,
            visibility_type: visibilityType,
          });
        }}
      />

      <FieldValuesTypePicker
        description={t`How this field should be filtered`}
        label={t`Filtering`}
        value={field.has_field_values}
        onChange={(hasFieldValues) => {
          updateField({
            id,
            has_field_values: hasFieldValues,
          });
        }}
      />
    </Stack>
  );
};
