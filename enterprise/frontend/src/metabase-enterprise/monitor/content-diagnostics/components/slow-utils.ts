import { t } from "ttag";

type DurationFilterOption = {
  value: number;
  label: string;
};

export function getDurationFilterOptions(): DurationFilterOption[] {
  return [
    { value: 15000, label: t`15 seconds or more` },
    { value: 30000, label: t`30 seconds or more` },
    { value: 60000, label: t`1 minute or more` },
    { value: 300000, label: t`5 minutes or more` },
  ];
}
