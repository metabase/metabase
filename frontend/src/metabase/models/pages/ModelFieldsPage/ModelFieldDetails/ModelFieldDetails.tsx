import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  NameDescriptionInput,
  SemanticTypeAndTargetPicker,
  TitledSection,
} from "metabase/metadata/components";
import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

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
  const handleChange = (patch: FieldPatch) => {
    onChangeField(field, patch);
  };

  const handleNameChange = (name: string) => {
    onChangeField(field, { display_name: name });
  };

  const handleDescriptionChange = (description: string | null) => {
    onChangeField(field, { description });
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
        <TitledSection title={t`Metadata`}>
          <SemanticTypeAndTargetPicker
            label={t`Semantic type`}
            description={t`What this data represents`}
            field={field}
            idFields={idFields}
            onChange={handleChange}
          />
        </TitledSection>
      </Flex>
    </Flex>
  );
}
