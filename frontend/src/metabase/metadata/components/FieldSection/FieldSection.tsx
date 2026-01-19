import { memo } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Group, Stack, type StackProps, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { MetadataEditEventDetail } from "metabase-types/analytics";
import type { Field, FieldId, Table } from "metabase-types/api";

import { NameDescriptionInput } from "../NameDescriptionInput";
import { ResponsiveButton } from "../ResponsiveButton";

import { BehaviorSection } from "./BehaviorSection";
import { DataSection } from "./DataSection";
import { FormattingSection } from "./FormattingSection/FormattingSection";
import { MetadataSection } from "./MetadataSection/MetadataSection";
import { useResponsiveButtons } from "./hooks";

type FieldSectionBaseProps = {
  field: Field;
  table: Table;
  parent?: Field;
  getFieldHref: (fieldId: FieldId) => string;
  onFieldValuesClick: () => void;
  onPreviewClick: () => void;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
};

const FieldSectionBase = ({
  field,
  parent,
  table,
  getFieldHref,
  onFieldValuesClick,
  onPreviewClick,
  onTrackMetadataChange,
  ...stackProps
}: FieldSectionBaseProps & StackProps) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const {
    buttonsContainerRef,
    showButtonLabel,
    setFieldValuesButtonWidth,
    setPreviewButtonWidth,
  } = useResponsiveButtons();

  const handleNameChange = async (name: string) => {
    const { error } = await updateField({ id, display_name: name });

    if (error) {
      sendErrorToast(t`Failed to update name of ${field.display_name}`);
    } else {
      sendSuccessToast(t`Name of ${field.display_name} updated`, async () => {
        const { error } = await updateField({
          id,
          display_name: field.display_name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateField({
      id,
      // API does not accept empty strings
      description: description.length === 0 ? null : description,
    });

    if (error) {
      sendErrorToast(t`Failed to update description of ${field.display_name}`);
    } else {
      sendSuccessToast(
        t`Description of ${field.display_name} updated`,
        async () => {
          const { error } = await updateField({
            id,
            description: field.description ?? "",
          });
          sendUndoToast(error);
        },
      );
    }
  };

  return (
    <Stack data-testid="field-section" gap={0} pb="lg" {...stackProps}>
      <Stack gap="md" pb="md">
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

        <Group
          align="center"
          gap="md"
          justify="space-between"
          miw={0}
          wrap="nowrap"
        >
          <Text flex="0 0 auto" fw="bold">{t`Field settings`}</Text>

          <Group
            flex="1"
            gap="md"
            justify="flex-end"
            miw={0}
            ref={buttonsContainerRef}
            wrap="nowrap"
          >
            {/* keep this in sync with getRequiredWidth in useResponsiveButtons */}

            <ResponsiveButton
              icon="eye"
              showLabel={showButtonLabel}
              onClick={onPreviewClick}
              onRequestWidth={setPreviewButtonWidth}
            >{t`Preview`}</ResponsiveButton>

            <ResponsiveButton
              icon="gear_settings_filled"
              showLabel={showButtonLabel}
              onClick={onFieldValuesClick}
              onRequestWidth={setFieldValuesButtonWidth}
            >{t`Field values`}</ResponsiveButton>
          </Group>
        </Group>
      </Stack>

      <Stack gap="xl">
        <DataSection
          field={field}
          onTrackMetadataChange={onTrackMetadataChange}
        />
        <MetadataSection
          field={field}
          table={table}
          getFieldHref={getFieldHref}
          onTrackMetadataChange={onTrackMetadataChange}
        />
        <BehaviorSection
          field={field}
          databaseId={table.db_id}
          onTrackMetadataChange={onTrackMetadataChange}
        />
        <FormattingSection
          field={field}
          onTrackMetadataChange={onTrackMetadataChange}
        />
      </Stack>
    </Stack>
  );
};

export const FieldSection = memo(FieldSectionBase);
