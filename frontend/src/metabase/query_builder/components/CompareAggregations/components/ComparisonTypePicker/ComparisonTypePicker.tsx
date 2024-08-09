import { t } from "ttag";

import { Input, Button, Flex, Stack } from "metabase/ui";

import type { ComparisonType } from "../../types";

type Props = {
  value: ComparisonType;
  onChange: (value: ComparisonType) => void;
};

export function ComparisonTypePicker({ onChange, value }: Props) {
  return (
    <Stack spacing="sm">
      <Input.Label>{t`How to compare`}</Input.Label>
      <Flex gap="sm">
        <Button
          variant={value === "values" ? "filled" : "default"}
          radius="xl"
          p="sm"
          onClick={() => onChange("values")}
        >{t`Compare values`}</Button>
        <Button
          variant={value === "moving-average" ? "filled" : "default"}
          radius="xl"
          p="sm"
          onClick={() => onChange("moving-average")}
        >{t`Moving average`}</Button>
      </Flex>
    </Stack>
  );
}
