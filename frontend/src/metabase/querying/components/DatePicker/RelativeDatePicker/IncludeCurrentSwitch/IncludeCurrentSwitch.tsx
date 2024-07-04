import { t } from "ttag";

import { Switch } from "metabase/ui";

import {
  getIncludeCurrentLabel,
  getIncludeCurrent,
  setIncludeCurrent,
} from "../DateIntervalPicker/utils";
import type { DateIntervalValue } from "../types";

interface IncludeCurrentSwitchProps {
  value: DateIntervalValue;
  onChange: (value: DateIntervalValue) => void;
}

export const IncludeCurrentSwitch = ({
  value,
  onChange,
}: IncludeCurrentSwitchProps) => {
  const includeCurrent = getIncludeCurrent(value);

  const handleIncludeCurrentSwitch = () => {
    onChange(setIncludeCurrent(value, !includeCurrent));
  };

  return (
    <Switch
      aria-checked={includeCurrent}
      checked={includeCurrent}
      data-testid="include-current-interval-option"
      label={t`Include ${getIncludeCurrentLabel(value.unit)}`}
      labelPosition="right"
      onChange={handleIncludeCurrentSwitch}
      size="sm"
    />
  );
};
