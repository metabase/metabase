import { t } from "ttag";

import { Button, Flex, Input, Stack } from "metabase/ui";

import type { ComparisonType } from "../../types";

type ComparisonTypeInputProps = {
  comparisonType: ComparisonType;
  onComparisonTypeChange: (value: ComparisonType) => void;
};

export function ComparisonTypeInput({
  comparisonType,
  onComparisonTypeChange,
}: ComparisonTypeInputProps) {
  return (
    <Stack spacing="sm">
      <Input.Label>{t`How to compare`}</Input.Label>
      <Flex gap="sm">
        <Button
          variant={comparisonType === "offset" ? "filled" : "default"}
          radius="xl"
          p="sm"
          onClick={() => onComparisonTypeChange("offset")}
        >
          {t`Compare values`}
        </Button>
        <Button
          variant={comparisonType === "moving-average" ? "filled" : "default"}
          radius="xl"
          p="sm"
          onClick={() => onComparisonTypeChange("moving-average")}
        >
          {t`Moving average`}
        </Button>
      </Flex>
    </Stack>
  );
}
