import { memo } from "react";
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
import type {
  DatabaseId,
  Field,
  FieldValuesType,
  FieldVisibilityType,
} from "metabase-types/api";

import { TitledSection } from "../../TitledSection";

import { RemappingPicker } from "./RemappingPicker";

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

  const handleVisibilityChange = async (
    visibilityType: FieldVisibilityType,
  ) => {
    const { error } = await updateField({
      id,
      visibility_type: visibilityType,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update visibility of ${field.display_name}`,
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Visibility of ${field.display_name} updated`,
      });
    }
  };

  const handleFilteringChange = async (hasFieldValues: FieldValuesType) => {
    const { error } = await updateField({
      id,
      has_field_values: hasFieldValues,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update filtering of ${field.display_name}`,
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Filtering of ${field.display_name} updated`,
      });
    }
  };

  const handleUnfoldJsonChange = async (
    jsonUnfolding: boolean,
  ): Promise<void> => {
    const { error } = await updateField({
      id,
      json_unfolding: jsonUnfolding,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: jsonUnfolding
          ? t`Failed to enable JSON unfolding for ${field.display_name}`
          : t`Failed to disable JSON unfolding for ${field.display_name}`,
      });
    } else {
      sendToast({
        icon: "check",
        message: jsonUnfolding
          ? t`JSON unfolding enabled for ${field.display_name}`
          : t`JSON unfolding disabled for ${field.display_name}`,
      });
    }
  };

  return (
    <TitledSection title={t`Behavior`}>
      <FieldVisibilityPicker
        description={t`Where this field should be displayed`}
        label={t`Visibility`}
        value={field.visibility_type}
        onChange={handleVisibilityChange}
      />

      <FieldValuesTypePicker
        description={t`How this field should be filtered`}
        label={t`Filtering`}
        value={field.has_field_values}
        onChange={handleFilteringChange}
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
          onChange={handleUnfoldJsonChange}
        />
      )}
    </TitledSection>
  );
};

export const BehaviorSection = memo(BehaviorSectionBase);
