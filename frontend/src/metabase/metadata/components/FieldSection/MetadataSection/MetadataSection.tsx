import { memo, useMemo } from "react";
import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { MetadataEditEventDetail } from "metabase-types/analytics";
import type { Field, FieldId, Table } from "metabase-types/api";

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
  const [updateField] = useUpdateFieldMutation();
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
    </TitledSection>
  );
};

export const MetadataSection = memo(MetadataSectionBase);
