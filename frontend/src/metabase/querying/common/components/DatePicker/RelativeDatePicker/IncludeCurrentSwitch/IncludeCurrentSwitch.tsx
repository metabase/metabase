import { t } from "ttag";

import type { RelativeDatePickerValue } from "metabase/querying/common/types";
import { Switch } from "metabase/ui";

import {
  getIncludeCurrent,
  getIncludeCurrentLabel,
  setIncludeCurrent,
} from "../DateIntervalPicker/utils";

interface IncludeCurrentSwitchProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
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
