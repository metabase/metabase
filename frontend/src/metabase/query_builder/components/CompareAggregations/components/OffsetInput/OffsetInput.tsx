import { useMemo } from "react";

import { Flex, NumberInput, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./OffsetInput.module.css";
import { getHelp, getLabel, parsePeriodValue } from "./utils";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  value: number | "";
  onChange: (value: number | "") => void;
}

export const OffsetInput = ({ query, stageIndex, value, onChange }: Props) => {
  const label = useMemo(() => getLabel(query, stageIndex), [query, stageIndex]);
  const help = useMemo(() => getHelp(query, stageIndex), [query, stageIndex]);

  return (
    <Flex align="flex-end" pos="relative">
      <NumberInput
        classNames={{
          input: S.input,
          wrapper: S.wrapper,
        }}
        label={label}
        min={1}
        parseValue={parsePeriodValue}
        precision={0}
        size="md"
        step={1}
        type="number"
        value={value}
        onChange={onChange}
      />
      <Text className={S.help} c="text-light" p="sm">
        {help}
      </Text>
    </Flex>
  );
};
