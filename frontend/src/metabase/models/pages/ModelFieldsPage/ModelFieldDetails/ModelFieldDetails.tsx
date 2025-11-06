import { useMemo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  FieldVisibilityPicker,
  LabeledValue,
  NameDescriptionInput,
  SemanticTypeAndTargetPicker,
  TitledSection,
} from "metabase/metadata/components";
import { Box, Flex } from "metabase/ui";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import * as Lib from "metabase-lib";
import type {
  Field,
  FieldFormattingSettings,
  FieldVisibilityType,
} from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../../constants";
import type { FieldPatch } from "../types";

import S from "./ModelFieldDetails.module.css";

type ModelFieldDetailsProps = {
  field: Field;
  idFields: Field[];
  onChangeField: (field: Field, patch: FieldPatch) => void;
};

export function ModelFieldDetails({
  field,
  idFields,
  onChangeField,
}: ModelFieldDetailsProps) {
  const denyList = useMemo(() => {
    return Lib.isCurrency(Lib.legacyColumnTypeInfo(field))
      ? new Set(["column_title", "number_style"])
      : new Set(["column_title"]);
  }, [field]);

  const inheritedSettings = useMemo(() => {
    return getGlobalSettingsForColumn();
  }, []);

  const handleChange = (patch: FieldPatch) => {
    onChangeField(field, patch);
  };

  const handleNameChange = (name: string) => {
    onChangeField(field, { display_name: name });
  };

  const handleDescriptionChange = (description: string | null) => {
    onChangeField(field, { description });
  };

  const handleVisibilityChange = (visibility: FieldVisibilityType) => {
    onChangeField(field, { visibility_type: visibility });
  };

  const handleSettingsChange = (settings: FieldFormattingSettings) => {
    onChangeField(field, { settings });
  };

  return (
    <Flex className={S.section} flex={1} direction="column" h="100%">
      <Box className={S.header} p="md">
        <NameDescriptionInput
          name={field.display_name}
          nameIcon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
          nameMaxLength={NAME_MAX_LENGTH}
          namePlaceholder={t`Give this field a name`}
          description={field.description ?? ""}
          descriptionPlaceholder={t`Give this field a description`}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
      </Box>
      <Flex direction="column" p="md" gap="md">
        <TitledSection title={t`Data`}>
          <LabeledValue label={t`Field name`}>{field.name}</LabeledValue>
          <LabeledValue label={t`Data type`}>
            {field.database_type}
          </LabeledValue>
        </TitledSection>
        <TitledSection title={t`Metadata`}>
          <SemanticTypeAndTargetPicker
            label={t`Semantic type`}
            description={t`What this data represents`}
            field={field}
            idFields={idFields}
            onChange={handleChange}
          />
        </TitledSection>
        <TitledSection title={t`Behavior`}>
          <FieldVisibilityPicker
            label={t`Visibility`}
            description={t`Where this field should be displayed`}
            value={field.visibility_type}
            onChange={handleVisibilityChange}
          />
        </TitledSection>
        <TitledSection title={t`Formatting`}>
          <ColumnSettings
            value={field.settings ?? {}}
            column={field}
            denylist={denyList}
            extraData={{ forAdminSettings: true }}
            inheritedSettings={inheritedSettings}
            style={{ maxWidth: undefined }}
            onChange={handleSettingsChange}
          />
        </TitledSection>
      </Flex>
    </Flex>
  );
}
