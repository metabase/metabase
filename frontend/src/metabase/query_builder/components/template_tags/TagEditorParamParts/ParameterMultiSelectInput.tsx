import { jt, t } from "ttag";

import {
  Box,
  Code,
  Group,
  HoverCard,
  Icon,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import { getIsMultiSelect } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Parameter, TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

type ParameterMultiSelectInputProps = {
  tag: TemplateTag;
  parameter: Parameter;
  onChangeMultiSelect: (isMultiSelect: boolean) => void;
};

export function ParameterMultiSelectInput({
  tag,
  parameter,
  onChangeMultiSelect,
}: ParameterMultiSelectInputProps) {
  return (
    <InputContainer>
      <ContainerLabel>{t`People can pick`}</ContainerLabel>
      <Radio.Group
        value={getIsMultiSelect(parameter).toString()}
        onChange={(value) => onChangeMultiSelect(value === "true")}
      >
        <Stack gap="xs">
          <Radio
            label={
              <Group gap="xs">
                {t`Multiple values`}
                {tag.type !== "dimension" && <ParameterMultiSelectHelpInfo />}
              </Group>
            }
            value="true"
          />
          <Radio label={t`A single value`} value="false" />
        </Stack>
      </Radio.Group>
    </InputContainer>
  );
}

function ParameterMultiSelectHelpInfo() {
  return (
    <HoverCard>
      <HoverCard.Target>
        <Icon
          c="text-secondary"
          name="info"
          data-testid="multi-select-info-icon"
        />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Box p="md" maw="24rem">
          <Text>
            {jt`Most of the time you’ll want to use this with an ${(
              <Code key="in" bg="background-tertiary">
                {"IN"}
              </Code>
            )} clause, like ${(
              <Code key="where" bg="background-tertiary">
                {"WHERE category IN ({{categories}})"}
              </Code>
            )}`}
          </Text>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
