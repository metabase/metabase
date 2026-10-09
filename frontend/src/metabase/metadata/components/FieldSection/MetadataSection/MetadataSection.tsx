import { memo, useMemo } from "react";
import { t } from "ttag";

import {
  useGetFieldQuery,
  useListDatabaseIdFieldsQuery,
  useResetFieldToAutomaticMutation,
  useUpdateFieldMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import type { MetadataEditEventDetail } from "metabase/metadata/pages/shared/analytics";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type {
  Field,
  FieldDataSensitivity,
  FieldId,
  Table,
} from "metabase-types/api";

import { DataSensitivityPicker } from "../../DataSensitivityPicker";
import { SemanticTypeAndTargetPicker } from "../../SemanticTypeAndTargetPicker";
import { TitledSection } from "../../TitledSection";
import { getSemanticTypeError } from "../utils";

type Patch = Partial<
  Pick<Field, "settings" | "semantic_type" | "fk_target_field_id">
>;

type MetadataSectionBaseProps = {
  field: Field;
  table: Table;
  getFieldHref: (fieldId: FieldId) => string;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
};

const MetadataSectionBase = ({
  field,
  table,
  getFieldHref,
  onTrackMetadataChange,
}: MetadataSectionBaseProps) => {
  const id = getRawTableFieldId(field);
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: table.db_id,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const { data: editableField } = useGetFieldQuery({
    id,
    include_editable_data_model: true,
  });
  const [updateField] = useUpdateFieldMutation();
  const [resetFieldToAutomatic] = useResetFieldToAutomaticMutation();
  const semanticTypeError = useMemo(() => {
    return getSemanticTypeError(table, field, getFieldHref);
  }, [table, field, getFieldHref]);
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleChange = async (patch: Patch) => {
    const { error } = await updateField({ id, ...patch });

    if (error) {
      sendErrorToast(
        t`Failed to update semantic type of ${field.display_name}`,
      );
    } else {
      onTrackMetadataChange("semantic_type_change");

      sendSuccessToast(
        t`Semantic type of ${field.display_name} updated`,
        async () => {
          const { error } = await updateField({
            id,
            fk_target_field_id: field.fk_target_field_id,
            semantic_type: field.semantic_type,
            settings: field.settings,
          });
          sendUndoToast(error);
        },
      );
    }
  };

  const handleDataSensitivityChange = async (
    dataSensitivity: FieldDataSensitivity | null,
  ) => {
    const { error } = await updateField({
      id,
      data_sensitivity: dataSensitivity,
    });

    if (error) {
      sendErrorToast(
        t`Failed to update data sensitivity of ${field.display_name}`,
      );
    } else {
      sendSuccessToast(t`Data sensitivity of ${field.display_name} updated`);
    }
  };

  const handleDataSensitivityReset = async () => {
    const { error } = await resetFieldToAutomatic({
      id,
      columns: ["data_sensitivity"],
    });

    if (error) {
      sendErrorToast(
        t`Failed to reset data sensitivity of ${field.display_name}`,
      );
    } else {
      sendSuccessToast(t`Data sensitivity of ${field.display_name} reset`);
    }
  };

  return (
    <TitledSection>
      <SemanticTypeAndTargetPicker
        description={t`What this data represents`}
        field={field}
        idFields={idFields}
        label={t`Semantic type`}
        semanticTypeError={semanticTypeError}
        onChange={handleChange}
      />

      <DataSensitivityPicker
        description={t`How sensitive this data is`}
        label={t`Data sensitivity`}
        source={editableField?.data_sensitivity_source ?? null}
        value={field.data_sensitivity ?? null}
        onChange={handleDataSensitivityChange}
        onReset={handleDataSensitivityReset}
      />
    </TitledSection>
  );
};

export const MetadataSection = memo(MetadataSectionBase);
