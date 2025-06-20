import { memo } from "react";
import { t } from "ttag";

import { useGetDatabaseQuery, useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
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

const BehaviorSectionBase = ({ databaseId, field }: Props) => {
  const id = getRawTableFieldId(field);
  const { data: database } = useGetDatabaseQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();

  return (
    <Stack gap="md">
      <Box>
        <SectionPill title={t`Behavior`} />
      </Box>

      <FieldVisibilityPicker
        description={t`Where this field should be displayed`}
        label={t`Visibility`}
        value={field.visibility_type}
        onChange={async (visibilityType) => {
          const { error } = await updateField({
            id,
            visibility_type: visibilityType,
          });

          if (!error) {
            sendToast({
              icon: "check",
              message: t`Visibility for ${field.display_name} updated`,
            });
          }
        }}
      />

      <FieldValuesTypePicker
        description={t`How this field should be filtered`}
        label={t`Filtering`}
        value={field.has_field_values}
        onChange={async (hasFieldValues) => {
          const { error } = await updateField({
            id,
            has_field_values: hasFieldValues,
          });

          if (!error) {
            sendToast({
              icon: "check",
              message: t`Filtering for ${field.display_name} updated`,
            });
          }
        }}
      />

      {database != null && (
        <RemappingPicker
          database={database}
          description={t`Choose to show the original value from the database, or have this field display associated or custom information.`}
          field={field}
          label={t`Display values`}
        />
      )}

      {database != null && canFieldUnfoldJson(field, database) && (
        <UnfoldJsonPicker
          description={t`Unfold JSON into component fields, where each JSON key becomes a column. You can turn this off if performance is slow.`}
          label={t`Unfold JSON`}
          value={isFieldJsonUnfolded(field, database)}
          onChange={async (jsonUnfolding) => {
            const { error } = await updateField({
              id,
              json_unfolding: jsonUnfolding,
            });

            if (!error) {
              sendToast({
                icon: "check",
                message: jsonUnfolding
                  ? t`JSON unfloding for ${field.display_name} enabled`
                  : t`JSON unfloding for ${field.display_name} disabled`,
              });
            }
          }}
        />
      )}
    </Stack>
  );
};

export const BehaviorSection = memo(BehaviorSectionBase);
