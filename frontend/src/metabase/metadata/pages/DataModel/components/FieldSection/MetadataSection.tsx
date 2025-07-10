import { memo } from "react";
import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DatabaseId, Field } from "metabase-types/api";

import { TitledSection } from "../TitledSection";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

const MetadataSectionBase = ({ databaseId, field }: Props) => {
  const id = getRawTableFieldId(field);
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();

  const handleUpdateField = async (
    field: Field,
    updates: Partial<
      Pick<Field, "settings" | "semantic_type" | "fk_target_field_id">
    >,
  ) => {
    const { id: _id, ...fieldAttributes } = field;
    const { error } = await updateField({
      id,
      ...fieldAttributes,
      ...updates,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        message: t`Failed to update semantic type of ${field.display_name}`,
        toastColor: "error",
      });
    } else {
      sendToast({
        icon: "check",
        message: t`Semantic type of ${field.display_name} updated`,
      });
    }
  };

  return (
    <TitledSection title={t`Metadata`}>
      <SemanticTypeAndTargetPicker
        description={t`What this data represents`}
        field={field}
        idFields={idFields}
        label={t`Semantic type`}
        onUpdateField={handleUpdateField}
      />
    </TitledSection>
  );
};

export const MetadataSection = memo(MetadataSectionBase);
