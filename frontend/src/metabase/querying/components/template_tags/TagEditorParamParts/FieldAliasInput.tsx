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

type FieldAliasInputProps = {
  tag: TemplateTag;
  onChange: (value: string | undefined) => void;
};

export function FieldAliasInput({ tag, onChange }: FieldAliasInputProps) {
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
          {t`Table and field alias`}
          <FieldAliasHelpInfo />
        </Group>
      </ContainerLabel>
      <TextInputBlurChange
        value={tag["alias"] ?? ""}
        placeholder={"MY_ALIAS.FIELD"}
        data-testid="field-alias-input"
        onBlurChange={(event) => handleChange(event.target.value)}
      />
    </InputContainer>
  );
}

function FieldAliasHelpInfo() {
  return (
    <HoverCard>
      <HoverCard.Target>
        <Icon
          c="text-secondary"
          name="info"
          data-testid="field-alias-info-icon"
        />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Box p="md" maw="24rem">
          <Text>
            {jt`Required only if the query uses an alias to refer to the mapped field's table. For example, if you map the variable to the ${(
              <Code key="field" bg="background-tertiary">
                {"products.category"}
              </Code>
            )} field, but the query aliases the ${(
              <Code key="table" bg="background-tertiary">
                {"products"}
              </Code>
            )} table as ${(
              <Code key="table-alias" bg="background-tertiary">
                {"p"}
              </Code>
            )}, you'd enter ${(
              <Code key="field-alias" bg="background-tertiary">
                {"p.category"}
              </Code>
            )}.`}
          </Text>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
