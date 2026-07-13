import { Input, NumberInput } from "metabase/ui";
import type { DatasetColumn, GoalValue } from "metabase-types/api";

import { ChartSettingGoalInput } from "../ChartSettingGoalInput";

export type SegmentBoundInputProps = {
  allowQuestionReference: boolean;
  columns?: DatasetColumn[];
  id: string;
  label: string;
  value: GoalValue | null;
  onChange: (value: GoalValue | null) => void;
};

export const SegmentBoundInput = ({
  allowQuestionReference,
  columns,
  id,
  label,
  value,
  onChange,
}: SegmentBoundInputProps) => {
  if (allowQuestionReference) {
    return (
      <Input.Wrapper label={label} w="100%">
        <ChartSettingGoalInput
          id={id}
          value={value ?? 0}
          onChange={onChange}
          columns={columns}
          allowQuestionReference
        />
      </Input.Wrapper>
    );
  }

  return (
    <NumberInput
      label={label}
      placeholder={label}
      w="100%"
      value={typeof value === "number" ? value : ""}
      onBlur={(e) => {
        const rawValue = e.target.value;
        const newValue = rawValue === "" ? null : parseFloat(rawValue);
        if (newValue !== value) {
          onChange(newValue);
        }
      }}
    />
  );
};
