import { t } from "ttag";

import { SortableFieldList } from "metabase/metadata/components";
import { FieldList } from "metabase/metadata/components/FieldList";
import { Box, Button, Flex, Group, Icon } from "metabase/ui";
import type { Field } from "metabase-types/api";

import type { FieldOverrides } from "../../../types";

import S from "./ModelFieldList.module.css";

type ModelFieldListProps = {
  fields: Field[];
  activeFieldName?: string;
  isSorting: boolean;
  isReadOnly: boolean;
  onSelectField: (field: Field) => void;
  onChangeField: (field: Field, overrides: FieldOverrides) => void;
  onChangeSorting: (fields: Field[]) => void;
  onToggleSorting: (isSorting: boolean) => void;
};

export function ModelFieldList({
  fields,
  activeFieldName,
  isSorting,
  isReadOnly,
  onSelectField,
  onChangeField,
  onChangeSorting,
  onToggleSorting,
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

  const handleSortingClick = () => {
    onToggleSorting(!isSorting);
  };

  const handleSortingChange = (fieldNames: string[]) => {
    const fieldByName = Object.fromEntries(
      fields.map((field) => [field.name, field]),
    );
    const fieldsInOrder = fieldNames.map((fieldName) => fieldByName[fieldName]);
    onChangeSorting(fieldsInOrder);
  };

  return (
    <Flex
      className={S.section}
      flex={activeFieldName ? "0 0 33%" : 1}
      direction="column"
    >
      {!isReadOnly && (
        <Group className={S.header} p="md" pb="sm">
          <Button
            px="sm"
            py="0.85rem"
            size="compact-md"
            leftSection={<Icon name={isSorting ? "check" : "sort_arrows"} />}
            onClick={handleSortingClick}
          >
            {isSorting ? t`Done` : t`Sorting`}
          </Button>
        </Group>
      )}
      <Box px="md" pb="md" pt={isReadOnly ? "md" : undefined}>
        {isSorting ? (
          <SortableFieldList
            fields={fields}
            getFieldKey={getFieldKey}
            onChange={handleSortingChange}
          />
        ) : (
          <FieldList
            fields={fields}
            activeFieldKey={activeFieldName}
            readOnly={isReadOnly}
            getFieldKey={getFieldKey}
            onSelect={onSelectField}
            onNameChange={handleNameChange}
            onDescriptionChange={handleDescriptionChange}
          />
        )}
      </Box>
    </Flex>
  );
}

function getFieldKey(field: Field) {
  return field.name;
}
