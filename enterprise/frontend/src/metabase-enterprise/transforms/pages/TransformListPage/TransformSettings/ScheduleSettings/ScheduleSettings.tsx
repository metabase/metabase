import { useState } from "react";
import { t } from "ttag";

import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import { formatCronExpressionForUI } from "metabase/lib/cron";
import { Select, Stack } from "metabase/ui";

import {
  ALL_OPTIONS,
  CUSTOM_OPTION,
  DEFAULT_SCHEDULE,
  EMPTY_OPTION,
  SHORTCUT_OPTIONS,
} from "./constants";

type ScheduleSettingsProps = {
  value: string | null;
  onChange: (value: string | null) => void;
};

export function ScheduleSettings({
  value: initialValue,
  onChange,
}: ScheduleSettingsProps) {
  const [value, setValue] = useState(initialValue);
  const [cronExpression, setCronExpression] = useState(() =>
    value != null ? formatCronExpressionForUI(value) : "",
  );
  const optionValue = getOptionValue(value);
  const [isCustom, setIsCustom] = useState(optionValue === CUSTOM_OPTION.value);

  const handleSelect = (newValue: string | null) => {
    if (newValue === EMPTY_OPTION.value) {
      setValue(null);
      setIsCustom(false);
      onChange(null);
    } else if (newValue === CUSTOM_OPTION.value) {
      setValue(DEFAULT_SCHEDULE);
      setCronExpression(formatCronExpressionForUI(DEFAULT_SCHEDULE));
      setIsCustom(true);
      onChange(DEFAULT_SCHEDULE);
    } else {
      setValue(newValue);
      setIsCustom(false);
      onChange(newValue);
    }
  };

  return (
    <Stack>
      <Select
        label={t`How often should this transform run?`}
        data={ALL_OPTIONS}
        value={optionValue}
        onChange={handleSelect}
      />
      {isCustom && (
        <CronExpressionInput
          value={cronExpression}
          getExplainMessage={(cronExplanation) =>
            t`We will run your transform ${cronExplanation}`
          }
          onChange={setCronExpression}
          onBlurChange={onChange}
        />
      )}
    </Stack>
  );
}

function getOptionValue(value: string | null) {
  if (value == null) {
    return EMPTY_OPTION.value;
  }
  if (SHORTCUT_OPTIONS.some((option) => option.value === value)) {
    return value;
  }
  return CUSTOM_OPTION.value;
}
