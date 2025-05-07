import { t } from "ttag";

import { useGetDatabaseQuery, useUpdateFieldMutation } from "metabase/api";
import {
  FieldValuesTypePicker,
  FieldVisibilityPicker,
  RemappingPicker,
  UnfoldJsonPicker,
} from "metabase/metadata/components";
import {
  canFieldUnfoldJson,
  getRawTableFieldId,
  isFieldJsonUnfolded,
} from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";
import type { DatabaseId, Field } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

export const BehaviorSection = ({ databaseId, field }: Props) => {
  const { data: database } = useGetDatabaseQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
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

      <RemappingPicker
        description={t`Choose to show the original value from the database, or have this field display associated or custom information.`}
        field={field}
        label={t`Display values`}
      />

      {database != null && canFieldUnfoldJson(field, database) && (
        <UnfoldJsonPicker
          description={t`Unfold JSON into component fields, where each JSON key becomes a column. You can turn this off if performance is slow.`}
          label={t`Unfold JSON`}
          value={isFieldJsonUnfolded(field, database)}
          onChange={(jsonUnfolding) => {
            updateField({
              id,
              json_unfolding: jsonUnfolding,
            });
          }}
        />
      )}
    </Stack>
  );
};
