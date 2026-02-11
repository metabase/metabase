import { jt, t } from "ttag";

import {
  Box,
  Code,
  Group,
  HoverCard,
  Icon,
  Text,
  TextInputBlurChange,
} from "metabase/ui";
import type { TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

type TableAliasInputProps = {
  tag: TemplateTag;
  onChange: (value: string | undefined) => void;
};

export function TableAliasInput({ tag, onChange }: TableAliasInputProps) {
  const alias = tag.alias;

  const handleChange = (value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue.length > 0) {
      onChange(trimmedValue);
    } else {
      onChange(undefined);
    }
  };

  return (
    <InputContainer>
      <ContainerLabel>
        <Group gap="xs">
          {t`Schema and table name`}
          <TableAliasHelpInfo />
        </Group>
      </ContainerLabel>
      <TextInputBlurChange
        value={alias ?? ""}
        placeholder={"MY_SCHEMA.TABLE"}
        data-testid="table-alias-input"
        onBlurChange={(event) => handleChange(event.target.value)}
      />
    </InputContainer>
  );
}

function TableAliasHelpInfo() {
  return (
    <HoverCard>
      <HoverCard.Target>
        <Icon
          c="text-secondary"
          name="info"
          data-testid="table-alias-info-icon"
        />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Box p="md" maw="24rem">
          <Text>
            {jt`If a table isn't listed, you can manually enter the schema and table name here (like ${(
              <Code key="table-alias" bg="background-tertiary">
                {"PUBLIC.PRODUCTS"}
              </Code>
            )}).`}
          </Text>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
