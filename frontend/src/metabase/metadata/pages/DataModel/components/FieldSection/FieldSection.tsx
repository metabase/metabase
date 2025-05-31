import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import {
  DiscardFieldValuesButton,
  NameDescriptionInput,
  RescanFieldButton,
} from "metabase/metadata/components";
import {
  getFieldDisplayName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Stack } from "metabase/ui";
import type { DatabaseId, Field } from "metabase-types/api";

import { BehaviorSection } from "./BehaviorSection";
import { DataSection } from "./DataSection";
import { FormattingSection } from "./FormattingSection";
import { MetadataSection } from "./MetadataSection";

interface Props {
  databaseId: DatabaseId;
  field: Field;
}

export const FieldSection = ({ databaseId, field }: Props) => {
  const [updateField] = useUpdateFieldMutation();
  const id = getRawTableFieldId(field);
  const [sendToast] = useToast();
  function confirm(message: string) {
    sendToast({ message });
  }

  return (
    <Stack gap="lg" h="100%">
      <NameDescriptionInput
        name={field.display_name}
        namePlaceholder={t`Give this field a name`}
        onNameChange={async (display_name) => {
          await updateField({ id, display_name });
          confirm(t`Display name for ${display_name} updated`);
        }}
        description={field.description ?? ""}
        descriptionPlaceholder={t`Give this field a description`}
        onDescriptionChange={async (description) => {
          await updateField({ id, description });
          confirm(t`Description for ${getFieldDisplayName(field)} updated`);
        }}
      />

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
