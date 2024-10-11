import { t } from "ttag";

import { Button, Flex, Input, Stack } from "metabase/ui";

import type { ComparisonType } from "../../types";

type Props = {
  value: ComparisonType;
  onChange: (value: ComparisonType) => void;
};

export function ComparisonTypePicker({ onChange, value }: Props) {
  return (
    <Stack gap="sm">
      <Input.Label>{t`How to compare`}</Input.Label>
      <Flex gap="sm">
        <Button
          variant={value === "offset" ? "filled" : "default"}
          radius="xl"
          p="sm"
          onClick={() => onChange("offset")}
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
