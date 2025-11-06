import { t } from "ttag";

import { FieldList } from "metabase/metadata/components/FieldList";
import { Box, Button, Flex, Group, Icon } from "metabase/ui";
import type { Field } from "metabase-types/api";

import type { FieldPatch } from "../types";

import S from "./ModelFieldList.module.css";

type ModelFieldListProps = {
  fields: Field[];
  activeFieldName?: string;
  onSelectField: (field: Field) => void;
  onChangeField: (field: Field, patch: FieldPatch) => void;
};

export function ModelFieldList({
  fields,
  activeFieldName,
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
    <Flex className={S.section} flex={1} direction="column">
      <Group
        className={S.header}
        pos="sticky"
        top={0}
        p="md"
        justify="end"
        bg="bg-light"
      >
        <Button size="sm" leftSection={<Icon name="sort_arrows" />}>
          {t`Sorting`}
        </Button>
      </Group>
      <Box px="md" pb="md">
        <FieldList
          fields={fields}
          activeFieldKey={activeFieldName}
          getFieldKey={(field) => field.name}
          onSelect={onSelectField}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
      </Box>
    </Flex>
  );
}
