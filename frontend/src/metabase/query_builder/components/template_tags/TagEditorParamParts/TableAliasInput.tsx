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
  const tableAlias = tag["table-alias"];

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
          {t`Table and schema alias`}
          <TableAliasHelpInfo />
        </Group>
      </ContainerLabel>
      <TextInputBlurChange
        value={tableAlias ?? ""}
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
            {jt`Required only if the query uses a table that does not exist yet in the database. If you map the variable to the ${(
              <Code key="table" bg="background-tertiary">
                {"products"}
              </Code>
            )} table in the ${(
              <Code key="schema" bg="background-tertiary">
                {"public"}
              </Code>
            )} schema, you would need to enter ${(
              <Code key="table-alias" bg="background-tertiary">
                {"public.products"}
              </Code>
            )} here.`}
          </Text>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
