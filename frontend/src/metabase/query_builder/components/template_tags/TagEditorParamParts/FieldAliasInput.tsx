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
import type Field from "metabase-lib/v1/metadata/Field";
import type { TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

type FieldAliasInputProps = {
  tag: TemplateTag;
  field: Field | null;
  onChange: (value: string | undefined) => void;
};

export function FieldAliasInput({
  tag,
  field,
  onChange,
}: FieldAliasInputProps) {
  const handleChange = (value: string) => {
    if (value.length > 0) {
      onChange(value);
    } else {
      onChange(undefined);
    }
  };

  return (
    <InputContainer>
      <ContainerLabel>
        <Group gap="xs">
          {t`Table and field alias`}
          <FieldAlisHelpInfo />
        </Group>
      </ContainerLabel>
      <TextInputBlurChange
        id={`tag-editor-field-alias_${tag.id}`}
        value={tag["alias"]}
        placeholder={field?.name}
        onBlurChange={(event) => handleChange(event.target.value)}
      />
    </InputContainer>
  );
}

function FieldAlisHelpInfo() {
  return (
    <HoverCard>
      <HoverCard.Target>
        <Icon c="text-secondary" name="info_filled" />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Box p="md" maw="24rem">
          <Text>
            {jt`Required only if the query uses an alias to refer to the mapped field's table. For example, if you map the variable to the ${(
              <Code key="field" bg="bg-medium">
                {"products.category"}
              </Code>
            )} field, but the query aliases the ${(
              <Code key="table" bg="bg-medium">
                {"products"}
              </Code>
            )} table as ${(
              <Code key="table-alias" bg="bg-medium">
                {"p"}
              </Code>
            )}, you'd enter ${(
              <Code key="field-alias" bg="bg-medium">
                {"p.category"}
              </Code>
            )}.`}
          </Text>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
