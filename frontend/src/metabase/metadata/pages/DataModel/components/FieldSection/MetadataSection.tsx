import { t } from "ttag";

import {
  useListDatabaseIdFieldsQuery,
  useUpdateFieldMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";
import type { DatabaseId, Field } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

export const MetadataSection = ({ databaseId, field }: Props) => {
  const { data: idFields = [] } = useListDatabaseIdFieldsQuery({
    id: databaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();
  function confirm(message: string) {
    sendToast({ message, icon: "check" });
  }

  return (
    <Stack gap="md">
      <Box>
        <SectionPill icon="model" title={t`Metadata`} />
      </Box>

      <SemanticTypeAndTargetPicker
        description={t`What this data represents`}
        field={field}
        idFields={idFields}
        label={t`Semantic type`}
        onUpdateField={async (field, updates) => {
          const { id: _id, ...fieldAttributes } = field;
          const id = getRawTableFieldId(field);
          await updateField({ id, ...fieldAttributes, ...updates });
          confirm(t`Semantic type for ${field.display_name} updated`);
        }}
      />
    </Stack>
  );
};
