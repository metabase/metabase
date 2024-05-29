import { useMemo } from "react";
import { t } from "ttag";

import { Flex, NumberInput, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./OffsetInput.module.css";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  value: number | "";
  onChange: (value: number | "") => void;
}

export const OffsetInput = ({ query, stageIndex, value, onChange }: Props) => {
  const label = useMemo(() => getLabel(query, stageIndex), [query, stageIndex]);

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
        {getHelp()}
      </Text>
    </Flex>
  );
};

const parsePeriodValue = (value: string): number | "" => {
  const number = parseInt(value, 10);
  return Number.isNaN(number) ? "" : Math.max(Math.abs(number), 1);
};

const getLabel = (query: Lib.Query, stageIndex: number): string => {
  const firstBreakout = Lib.breakouts(query, stageIndex)[0];

  if (firstBreakout) {
    const firstBreakoutColumn = Lib.breakoutColumn(
      query,
      stageIndex,
      firstBreakout,
    );

    if (!Lib.isDate(firstBreakoutColumn)) {
      return t`Row for comparison`;
    }
  }

  return t`Previous period`;
};

const getHelp = (): string => {
  // TODO: implement me
  return t`period ago based on grouping`;
};
