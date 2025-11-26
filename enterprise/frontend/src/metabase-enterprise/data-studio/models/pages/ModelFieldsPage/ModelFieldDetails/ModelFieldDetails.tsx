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
import { Box, Flex, Group, Title } from "metabase/ui";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import * as Lib from "metabase-lib";
import type {
  Field,
  FieldFormattingSettings,
  FieldVisibilityType,
} from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../../constants";
import type { FieldOverrides } from "../../../types";

import S from "./ModelFieldDetails.module.css";

type ModelFieldDetailsProps = {
  field: Field;
  idFields: Field[];
  isReadOnly: boolean;
  onChangeField: (field: Field, overrides: FieldOverrides) => void;
};

export function ModelFieldDetails({
  field,
  idFields,
  isReadOnly,
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

  const handleChange = (overrides: FieldOverrides) => {
    onChangeField(field, overrides);
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
    <Flex
      className={S.section}
      flex={1}
      direction="column"
      h="100%"
      bg="bg-white"
    >
      <Box p="md">
        <NameDescriptionInput
          name={field.display_name}
          nameIcon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
          nameMaxLength={NAME_MAX_LENGTH}
          namePlaceholder={t`Give this field a name`}
          description={field.description ?? ""}
          descriptionPlaceholder={
            isReadOnly
              ? t`No description yet`
              : t`Give this field a description`
          }
          readOnly={isReadOnly}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
      </Box>
      <Title order={5} px="md">
        {t`Settings`}
      </Title>
      <Flex direction="column" p="md" gap="md">
        <TitledSection>
          <Group>
            <Box flex={1}>
              <LabeledValue label={t`Field name`}>{field.name}</LabeledValue>
            </Box>
            <Box flex={1}>
              <LabeledValue label={t`Data type`}>
                {field.database_type}
              </LabeledValue>
            </Box>
          </Group>
        </TitledSection>
        {!isReadOnly && (
          <>
            <TitledSection>
              <SemanticTypeAndTargetPicker
                label={t`Semantic type`}
                description={t`What this data represents`}
                field={field}
                idFields={idFields}
                onChange={handleChange}
              />
            </TitledSection>
            <TitledSection>
              <FieldVisibilityPicker
                label={t`Visibility`}
                description={t`Where this field should be displayed`}
                value={field.visibility_type}
                onChange={handleVisibilityChange}
              />
            </TitledSection>
            <TitledSection>
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
          </>
        )}
      </Flex>
    </Flex>
  );
}
