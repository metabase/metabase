import { t } from "ttag";

import { useGetDatabaseQuery, useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import {
  FieldValuesTypePicker,
  FieldVisibilityPicker,
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

  const [sendToast] = useToast();
  function confirm(message: string) {
    sendToast({ message, icon: "check" });
  }

  return (
    <Stack gap="md">
      <Box>
        <SectionPill icon="filter" title={t`Behavior`} />
      </Box>

      <FieldVisibilityPicker
        description={t`Where this field should be displayed`}
        label={t`Visibility`}
        value={field.visibility_type}
        onChange={async (visibilityType) => {
          await updateField({
            id,
            visibility_type: visibilityType,
          });
          confirm(t`Visibility for ${field.display_name} updated`);
        }}
      />

      <FieldValuesTypePicker
        description={t`How this field should be filtered`}
        label={t`Filtering`}
        value={field.has_field_values}
        onChange={async (hasFieldValues) => {
          await updateField({
            id,
            has_field_values: hasFieldValues,
          });
          confirm(t`Filtering for ${field.display_name} updated`);
        }}
      />

      {database != null && canFieldUnfoldJson(field, database) && (
        <UnfoldJsonPicker
          description={t`Unfold JSON into component fields, where each JSON key becomes a column. You can turn this off if performance is slow.`}
          label={t`Unfold JSON`}
          value={isFieldJsonUnfolded(field, database)}
          onChange={async (jsonUnfolding) => {
            await updateField({
              id,
              json_unfolding: jsonUnfolding,
            });
            if (jsonUnfolding) {
              confirm(t`JSON unfloding for ${field.display_name} enabled`);
            } else {
              confirm(t`JSON unfloding for ${field.display_name} disabled`);
            }
          }}
        />
      )}
    </Stack>
  );
};
