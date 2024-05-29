import { t } from "ttag";

import { Flex, NumberInput, Text } from "metabase/ui";

import S from "./OffsetInput.module.css";

interface Props {
  value: number | "";
  onChange: (value: number | "") => void;
}

export const OffsetInput = ({ value, onChange }: Props) => {
  return (
    <Flex align="flex-end" pos="relative">
      <NumberInput
        classNames={{
          input: S.input,
          wrapper: S.wrapper,
        }}
        label={getLabel()}
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

const getLabel = (): string => {
  // TODO: implement me
  return t`Previous period`;
};

const getHelp = (): string => {
  return t`period ago based on grouping`;
};
