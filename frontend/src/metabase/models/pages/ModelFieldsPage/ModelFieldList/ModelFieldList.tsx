import { t } from "ttag";

import { FieldList } from "metabase/metadata/components/FieldList";
import { Box, Button, Flex, Group, Icon } from "metabase/ui";
import type { Field } from "metabase-types/api";

import S from "./ModelFieldList.module.css";

type ModelFieldListProps = {
  fields: Field[];
  onNameChange: (field: Field, name: string) => void;
  onDescriptionChange: (field: Field, description: string | null) => void;
};

export function ModelFieldList({
  fields,
  onNameChange,
  onDescriptionChange,
}: ModelFieldListProps) {
  return (
    <Flex className={S.section} direction="column">
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
          onNameChange={onNameChange}
          onDescriptionChange={onDescriptionChange}
        />
      </Box>
    </Flex>
  );
}
