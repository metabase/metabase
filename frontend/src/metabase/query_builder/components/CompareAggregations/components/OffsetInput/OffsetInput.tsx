import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { Flex, NumberInput, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ComparisonType } from "../../types";

import S from "./OffsetInput.module.css";
import { getHelp } from "./utils";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  value: number | "";
  onChange: (value: number | "") => void;
  comparisonType: ComparisonType;
}

export const OffsetInput = ({
  query,
  stageIndex,
  value,
  onChange,
  comparisonType,
}: Props) => {
  const help = useMemo(
    () => getHelp(query, stageIndex, comparisonType),
    [query, stageIndex, comparisonType],
  );

  const handleChange = useCallback(
    (value: number | "") => {
      if (typeof value === "number") {
        onChange(Math.floor(Math.max(Math.abs(value), 1)));
      } else {
        onChange(value);
      }
    },
    [onChange],
  );

  return (
    <Flex align="flex-end" pos="relative">
      <NumberInput
        classNames={{
          input: S.input,
          wrapper: S.wrapper,
        }}
        label={t`Compare to`}
        min={comparisonType === "offset" ? 1 : 2}
        precision={0}
        size="md"
        step={1}
        type="number"
        value={value}
        onChange={handleChange}
      />
      <Text className={S.help} c="text-light" p="sm">
        {help}
      </Text>
    </Flex>
  );
};
