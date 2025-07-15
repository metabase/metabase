import { memo } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getColumnIcon } from "metabase/common/utils/columns";
import { NameDescriptionInput } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
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
  isPreviewOpen: boolean;
  parent?: Field;
  onFieldValuesClick: () => void;
  onPreviewClick: () => void;
}

const FieldSectionBase = ({
  databaseId,
  field,
  isPreviewOpen,
  parent,
  onFieldValuesClick,
  onPreviewClick,
}: Props) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();

  const handleNameChange = async (
    name: string,
    previousName = field.display_name,
  ) => {
    const { error } = await updateField({ id, display_name: name });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update name of ${field.display_name}`,
      });
    } else {
      sendToast({
        action: () => handleNameChange(previousName, name),
        actionLabel: t`Undo`,
        icon: "check",
        message: t`Name of ${field.display_name} updated`,
      });
    }
  };

  const handleDescriptionChange = async (
    description: string,
    previousDescription = field.description ?? "",
  ) => {
    const { error } = await updateField({
      id,
      // API does not accept empty strings
      description: description.length === 0 ? null : description,
    });

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to update description of ${field.display_name}`,
      });
    } else {
      sendToast({
        action: () => handleDescriptionChange(previousDescription, description),
        actionLabel: t`Undo`,
        icon: "check",
        message: t`Description of ${field.display_name} updated`,
      });
    }
  };

  return (
    <Stack data-testid="field-section" gap={0} pb="xl">
      <Box
        bg="accent-gray-light"
        className={S.header}
        pb="lg"
        pos="sticky"
        pt="xl"
        px="xl"
        top={0}
      >
        <NameDescriptionInput
          description={field.description ?? ""}
          descriptionPlaceholder={t`Give this field a description`}
          name={field.display_name}
          nameIcon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
          nameMaxLength={254}
          namePlaceholder={t`Give this field a name`}
          namePrefix={parent?.display_name}
          onDescriptionChange={handleDescriptionChange}
          onNameChange={handleNameChange}
        />
      </Box>

      <Stack gap={12} mb={12} px="xl">
        <Group align="center" gap="md" justify="space-between">
          <Text flex="0 0 auto" fw="bold">{t`Field settings`}</Text>

          <Group
            className={S.buttons}
            flex="1"
            gap="md"
            justify="flex-end"
            wrap="nowrap"
          >
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
              h={32}
              leftSection={<Icon name="gear_settings_filled" />}
              px="sm"
              py="xs"
              size="xs"
              onClick={onFieldValuesClick}
            >{t`Field values`}</Button>
          </Group>
        </Group>
      </Stack>

      <Stack gap="xl" px="xl">
        <DataSection field={field} />
        <MetadataSection databaseId={databaseId} field={field} />
        <BehaviorSection databaseId={databaseId} field={field} />
        <FormattingSection field={field} />
      </Stack>
    </Stack>
  );
};

export const FieldSection = memo(FieldSectionBase);
