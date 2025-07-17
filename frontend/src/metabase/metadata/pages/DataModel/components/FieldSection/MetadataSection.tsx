import { memo, useMemo } from "react";
import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DatabaseId, Field, Table } from "metabase-types/api";

import { TitledSection } from "../TitledSection";

import { getSemanticTypeError } from "./utils";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  table: Table;
}

const MetadataSectionBase = ({ databaseId, field, table }: Props) => {
  const id = getRawTableFieldId(field);
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();
  const semanticTypeError = useMemo(() => {
    return getSemanticTypeError(table, field);
  }, [table, field]);

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
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update semantic type of ${field.display_name}`,
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
        semanticTypeError={semanticTypeError}
        onUpdateField={handleUpdateField}
      />
    </TitledSection>
  );
};

export const MetadataSection = memo(MetadataSectionBase);
