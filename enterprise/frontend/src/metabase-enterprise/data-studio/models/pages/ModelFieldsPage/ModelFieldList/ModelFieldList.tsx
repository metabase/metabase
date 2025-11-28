import { FieldList } from "metabase/metadata/components/FieldList";
import { Box, Flex } from "metabase/ui";
import type { Field } from "metabase-types/api";

import type { FieldOverrides } from "../../../types";

import S from "./ModelFieldList.module.css";

type ModelFieldListProps = {
  fields: Field[];
  activeFieldName?: string;
  isReadOnly: boolean;
  onSelectField: (field: Field) => void;
  onChangeField: (field: Field, overrides: FieldOverrides) => void;
};

export function ModelFieldList({
  fields,
  activeFieldName,
  isReadOnly,
  onSelectField,
  onChangeField,
}: ModelFieldListProps) {
  const handleNameChange = (field: Field, name: string) => {
    onChangeField(field, { display_name: name });
  };

  const handleDescriptionChange = (
    field: Field,
    description: string | null,
  ) => {
    onChangeField(field, { description });
  };

  return (
    <Flex
      className={S.section}
      flex={activeFieldName ? "0 0 33%" : 1}
      direction="column"
    >
      <Box px="md" pb="md" pt={isReadOnly ? "md" : undefined}>
        <FieldList
          fields={fields}
          activeFieldKey={activeFieldName}
          readOnly={isReadOnly}
          getFieldKey={getFieldKey}
          onSelect={onSelectField}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
      </Box>
    </Flex>
  );
}

function getFieldKey(field: Field) {
  return field.name;
}
