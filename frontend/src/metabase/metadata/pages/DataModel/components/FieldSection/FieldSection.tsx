import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  DiscardFieldValuesButton,
  NameDescriptionInput,
  RescanFieldButton,
} from "metabase/metadata/components";
import {
  getFieldDisplayName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Box, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatabaseId, Field } from "metabase-types/api";

import { BehaviorSection } from "./BehaviorSection";
import { DataSection } from "./DataSection";
import S from "./FieldSection.module.css";
import { FormattingSection } from "./FormattingSection";
import { MetadataSection } from "./MetadataSection";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

export const FieldSection = ({ databaseId, field }: Props) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();

  return (
    <Stack gap={0} p="xl" pt={0}>
      <Box
        bg="accent-gray-light"
        className={S.header}
        pb="lg"
        pos="sticky"
        pt="xl"
        top={0}
      >
        <NameDescriptionInput
          name={field.display_name}
          nameIcon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
          nameMaxLength={254}
          namePlaceholder={t`Give this field a name`}
          onNameChange={async (name) => {
            await updateField({ id, display_name: name });

            sendToast({
              icon: "check",
              message: t`Display name for ${name} updated`,
            });
          }}
          description={field.description ?? ""}
          descriptionPlaceholder={t`Give this field a description`}
          onDescriptionChange={async (description) => {
            const newDescription = description.trim();

            await updateField({
              id,
              // API does not accept empty strings
              description: newDescription.length === 0 ? null : newDescription,
            });

            sendToast({
              icon: "check",
              message: t`Description for ${getFieldDisplayName(field)} updated`,
            });
          }}
        />
      </Box>

      <Stack gap="xl">
        <DataSection field={field} />
        <MetadataSection databaseId={databaseId} field={field} />
        <BehaviorSection databaseId={databaseId} field={field} />
        <FormattingSection field={field} />

        <Stack gap="sm" mt="lg">
          <RescanFieldButton fieldId={getRawTableFieldId(field)} />
          <DiscardFieldValuesButton fieldId={getRawTableFieldId(field)} />
        </Stack>
      </Stack>
    </Stack>
  );
};
