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

  return (
    <TitledSection title={t`Metadata`}>
      <SemanticTypeAndTargetPicker
        description={t`What this data represents`}
        field={field}
        idFields={idFields}
        label={t`Semantic type`}
        onUpdateField={async (field, updates) => {
          const { id: _id, ...fieldAttributes } = field;
          await updateField({ id, ...fieldAttributes, ...updates });

          sendToast({
            icon: "check",
            message: t`Semantic type for ${field.display_name} updated`,
          });
        }}
      />
    </TitledSection>
  );
};

export const MetadataSection = memo(MetadataSectionBase);
