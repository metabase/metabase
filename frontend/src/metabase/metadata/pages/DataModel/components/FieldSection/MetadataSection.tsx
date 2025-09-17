import { memo, useMemo } from "react";
import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DatabaseId, Field, Table } from "metabase-types/api";

import { trackMetadataChange } from "../../analytics";
import { TitledSection } from "../TitledSection";

import { getSemanticTypeError } from "./utils";

type Patch = Partial<
  Pick<Field, "settings" | "semantic_type" | "fk_target_field_id">
>;

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
  const semanticTypeError = useMemo(() => {
    return getSemanticTypeError(table, field);
  }, [table, field]);
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleChange = async (patch: Patch) => {
    const { error } = await updateField({ id, ...patch });

    trackMetadataChange("semantic_type_change");

    if (error) {
      sendErrorToast(
        t`Failed to update semantic type of ${field.display_name}`,
      );
    } else {
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
