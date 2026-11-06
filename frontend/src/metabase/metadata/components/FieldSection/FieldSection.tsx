import { memo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { useFieldUpdateHandlers } from "metabase/metadata/hooks";
import type { MetadataEditEventDetail } from "metabase/metadata/pages/shared/analytics";
import { Group, Stack, type StackProps, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
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
  const readOnly = !table.can_write;
  const { handleNameChange, handleDescriptionChange } = useFieldUpdateHandlers({
    field,
  });
  const {
    buttonsContainerRef,
    showButtonLabel,
    setFieldValuesButtonWidth,
    setPreviewButtonWidth,
  } = useResponsiveButtons();

  return (
    <Stack data-testid="field-section" gap={0} pb="xl" {...stackProps}>
      <Stack gap="lg" pb="lg">
        <NameDescriptionInput
          description={field.description ?? ""}
          descriptionPlaceholder={t`Give this field a description`}
          name={field.display_name}
          nameIcon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
          nameMaxLength={254}
          namePlaceholder={t`Give this field a name`}
          namePrefix={parent?.display_name}
          readOnly={readOnly}
          onDescriptionChange={handleDescriptionChange}
          onNameChange={handleNameChange}
        />

        <Group
          align="center"
          gap="lg"
          justify="space-between"
          miw={0}
          wrap="nowrap"
        >
          <Text flex="0 0 auto" fw="bold">{t`Field settings`}</Text>

          <Group
            flex="1"
            gap="lg"
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

      <Stack gap="xxl">
        <DataSection
          field={field}
          disabled={readOnly}
          onTrackMetadataChange={onTrackMetadataChange}
        />
        <MetadataSection
          field={field}
          table={table}
          getFieldHref={getFieldHref}
          disabled={readOnly}
          onTrackMetadataChange={onTrackMetadataChange}
        />
        <BehaviorSection
          field={field}
          databaseId={table.db_id}
          disabled={readOnly}
          onTrackMetadataChange={onTrackMetadataChange}
        />
        <FormattingSection
          field={field}
          disabled={readOnly}
          onTrackMetadataChange={onTrackMetadataChange}
        />
      </Stack>
    </Stack>
  );
};

export const FieldSection = memo(FieldSectionBase);
