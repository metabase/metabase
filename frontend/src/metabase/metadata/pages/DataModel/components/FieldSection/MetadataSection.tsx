import { memo, useMemo } from "react";
import { t } from "ttag";

import { useListDatabaseIdFieldsQuery } from "metabase/api";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type {
  FieldChangeParams,
  MetadataEditMode,
} from "metabase/metadata/pages/DataModel/types";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DatabaseId, Field, Table } from "metabase-types/api";

import { trackMetadataChange } from "../../analytics";
import { TitledSection } from "../TitledSection";

import { getSemanticTypeError } from "./utils";

type Patch = Partial<
  Pick<Field, "settings" | "semantic_type" | "fk_target_field_id">
>;

type MetadataSectionProps = {
  mode: MetadataEditMode;
  onFieldChange: (update: FieldChangeParams) => Promise<{ error?: string }>;
} & (
  | {
      mode: "table";
      databaseId: DatabaseId;
      field: Field;
      table: Table;
    }
  | {
      mode: "model";
      field: Field;
    }
);

const MetadataSectionBase = ({
  mode,
  databaseId,
  field,
  table,
  onFieldChange,
}: MetadataSectionProps) => {
  const fieldIdentity =
    mode === "table" ? { id: getRawTableFieldId(field) } : { name: field.name };
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });

  const semanticTypeError = useMemo(() => {
    return getSemanticTypeError(table, field);
  }, [table, field]);
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleChange = async (patch: Patch) => {
    const { error } = await onFieldChange({ ...fieldIdentity, ...patch });

    if (error) {
      sendErrorToast(
        t`Failed to update semantic type of ${field.display_name}`,
      );
    } else {
      trackMetadataChange("semantic_type_change");

      sendSuccessToast(
        t`Semantic type of ${field.display_name} updated`,
        async () => {
          const { error } = await onFieldChange({
            ...fieldIdentity,
            fk_target_field_id: field.fk_target_field_id,
            semantic_type: field.semantic_type,
            settings: field.settings,
          });
          sendUndoToast(error);
        },
      );
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
        onChange={handleChange}
      />
    </TitledSection>
  );
};

export const MetadataSection = memo(MetadataSectionBase);
