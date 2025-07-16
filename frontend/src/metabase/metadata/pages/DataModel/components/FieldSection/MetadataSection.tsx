import { memo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DatabaseId, Field } from "metabase-types/api";

import { TitledSection } from "../TitledSection";

type Patch = Partial<
  Pick<Field, "settings" | "semantic_type" | "fk_target_field_id">
>;

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
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleChange = async (patch: Patch) => {
    const { error } = await updateField({ id, ...patch });

    if (error) {
      sendErrorToast(
        t`Failed to update semantic type of ${field.display_name}`,
      );
    } else {
      sendSuccessToast(
        t`Semantic type of ${field.display_name} updated`,
        async () => {
          const reversePatch = _.pick(field, Object.keys(patch));
          const { error } = await updateField({ ...reversePatch, id });
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
        onChange={handleChange}
      />
    </TitledSection>
  );
};

export const MetadataSection = memo(MetadataSectionBase);
