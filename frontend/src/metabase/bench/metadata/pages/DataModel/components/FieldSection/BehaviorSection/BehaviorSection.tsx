import { memo } from "react";
import { t } from "ttag";

import { useGetDatabaseQuery, useUpdateFieldMutation } from "metabase/api";
import {
  FieldValuesTypePicker,
  FieldVisibilityPicker,
  UnfoldJsonPicker,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
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

import { trackMetadataChange } from "../../../analytics";
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
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleVisibilityChange = async (
    visibilityType: FieldVisibilityType,
  ) => {
    const { error } = await updateField({
      id,
      visibility_type: visibilityType,
    });

    trackMetadataChange("visibility_change");

    if (error) {
      sendErrorToast(t`Failed to update visibility of ${field.display_name}`);
    } else {
      sendSuccessToast(
        t`Visibility of ${field.display_name} updated`,
        async () => {
          const { error } = await updateField({
            id,
            visibility_type: field.visibility_type,
          });
          sendUndoToast(error);
        },
      );
    }
  };

  const handleFilteringChange = async (hasFieldValues: FieldValuesType) => {
    const { error } = await updateField({
      id,
      has_field_values: hasFieldValues,
    });

    trackMetadataChange("filtering_change");

    if (error) {
      sendErrorToast(t`Failed to update filtering of ${field.display_name}`);
    } else {
      sendSuccessToast(
        t`Filtering of ${field.display_name} updated`,
        async () => {
          const { error } = await updateField({
            id,
            has_field_values: field.has_field_values,
          });
          sendUndoToast(error);
        },
      );
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
      sendErrorToast(
        jsonUnfolding
          ? t`Failed to enable JSON unfolding for ${field.display_name}`
          : t`Failed to disable JSON unfolding for ${field.display_name}`,
      );
    } else {
      trackMetadataChange("json_unfolding");

      sendSuccessToast(
        jsonUnfolding
          ? t`JSON unfolding enabled for ${field.display_name}`
          : t`JSON unfolding disabled for ${field.display_name}`,
        async () => {
          const { error } = await updateField({
            id,
            json_unfolding: field.json_unfolding ?? false,
          });
          sendUndoToast(error);
        },
      );
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
