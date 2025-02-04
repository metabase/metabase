import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import {
  QuestionPickerModal,
  getQuestionPickerValue,
} from "metabase/common/components/QuestionPicker";
import SelectButton from "metabase/core/components/SelectButton";
import { Box, Radio, Select, Stack, Text } from "metabase/ui";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { CardGoalValue, GoalValue } from "metabase-types/api";

import { ChartSettingInputNumeric } from "../ChartSettingInputNumeric";
import type { ChartSettingWidgetProps } from "../types";

type GoalValuePickerProps = ChartSettingWidgetProps<GoalValue>;

type ValueType = "static" | "card";

export function GoalValuePicker({
  value,
  onChange,
  ...rest
}: GoalValuePickerProps) {
  const [valueType, setValueType] = useState<ValueType>(
    getInitialValueType(value),
  );

  const options = [
    { name: t`Static value`, value: "static" },
    { name: t`From another question`, value: "card" },
  ];

  return (
    <Stack>
      <Radio.Group
        value={valueType}
        onChange={nextValueType => setValueType(nextValueType as ValueType)}
      >
        {options.map(option => (
          <Radio
            key={option.value}
            label={
              <Text
                fw="bold"
                c={valueType === option.value ? "brand" : undefined}
              >
                {option.name}
              </Text>
            }
            value={option.value}
            styles={{ inner: { alignSelf: "center" } }}
          />
        ))}
      </Radio.Group>
      <Box mt="sm">
        {valueType === "static" ? (
          <ChartSettingInputNumeric
            {...rest}
            value={typeof value === "number" ? value : 0}
            onChange={value => onChange(value)}
          />
        ) : (
          <CardPicker value={value} onChange={onChange} />
        )}
      </Box>
    </Stack>
  );
}

interface CardPickerProps {
  value: CardGoalValue | null | undefined;
  onChange: (value: CardGoalValue) => void;
}

function CardPicker({ value, onChange }: CardPickerProps) {
  const [isCardPickerOpen, { open, close }] = useDisclosure(false);

  const { data: card } = useGetCardQuery(
    value?.card_id ? { id: value.card_id } : skipToken,
  );

  const fields = (card?.result_metadata ?? []).filter(field =>
    isNumeric(field),
  );

  return (
    <>
      <Stack>
        <SelectButton onClick={open}>
          {card?.name ?? t`Select a question`}
        </SelectButton>
        {card && (
          <Select
            value={value?.value_field}
            data={fields.map(field => ({
              value: field.name,
              label: field.display_name,
            }))}
            onChange={field => {
              if (field) {
                onChange({
                  type: "card",
                  card_id: value!.card_id!,
                  value_field: field,
                });
              }
            }}
          ></Select>
        )}
      </Stack>
      {isCardPickerOpen && (
        <QuestionPickerModal
          title={t`Select a question`}
          value={
            card
              ? getQuestionPickerValue({ id: card.id, type: card.type })
              : undefined
          }
          onChange={({ id }) => {
            onChange({ type: "card", card_id: id, value_field: "" });
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}

function getInitialValueType(value: GoalValuePickerProps["value"]): ValueType {
  if (
    typeof value === "number" ||
    typeof value === "undefined" ||
    value === null
  ) {
    return "static";
  }
  return value.type;
}
