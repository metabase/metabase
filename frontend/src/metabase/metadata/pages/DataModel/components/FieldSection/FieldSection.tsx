import { memo, useState } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getColumnIcon } from "metabase/common/utils/columns";
import { NameDescriptionInput } from "metabase/metadata/components";
import {
  getFieldDisplayName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatabaseId, Field } from "metabase-types/api";

import { BehaviorSection } from "./BehaviorSection";
import { DataSection } from "./DataSection";
import S from "./FieldSection.module.css";
import { FieldValuesModal } from "./FieldValuesModal";
import { FormattingSection } from "./FormattingSection";
import { MetadataSection } from "./MetadataSection";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  isPreviewOpen: boolean;
  onPreviewClick: () => void;
}

const FieldSectionBase = ({
  databaseId,
  field,
  isPreviewOpen,
  onPreviewClick,
}: Props) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();
  const [isFieldValuesModalOpen, setIsFieldValuesModalOpen] = useState(false);

  return (
    <Stack gap={0} p="xl" pt={0}>
      <Box
        bg="bg-white"
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

      <Stack gap={12}>
        <Group align="center" gap="md" justify="space-between" wrap="nowrap">
          <Text flex="0 0 auto" fw="bold">{t`Field settings`}</Text>

          <Group gap="md" justify="flex-end">
            {!isPreviewOpen && (
              <Button
                leftSection={<Icon name="eye" />}
                px="sm"
                py="xs"
                size="xs"
                onClick={onPreviewClick}
              >{t`Preview`}</Button>
            )}

            <Button
              h={33}
              leftSection={<Icon name="gear_settings_filled" />}
              px="sm"
              py="xs"
              size="xs"
              onClick={() => setIsFieldValuesModalOpen(true)}
            >{t`Field values`}</Button>
          </Group>
        </Group>
      </Stack>

      <Stack gap="xl">
        <DataSection field={field} />
        <MetadataSection databaseId={databaseId} field={field} />
        <BehaviorSection databaseId={databaseId} field={field} />
        <FormattingSection field={field} />
      </Stack>

      <FieldValuesModal
        fieldId={id}
        isOpen={isFieldValuesModalOpen}
        onClose={() => setIsFieldValuesModalOpen(false)}
      />
    </Stack>
  );
};

export const FieldSection = memo(FieldSectionBase);
