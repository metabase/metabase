import { t } from "ttag";

type DuplicateCountFilterOption = {
  value: number;
  label: string;
};

export function getDuplicateCountFilterOptions(): DuplicateCountFilterOption[] {
  return [
    { value: 2, label: t`2 or more` },
    { value: 3, label: t`3 or more` },
    { value: 5, label: t`5 or more` },
    { value: 10, label: t`10 or more` },
  ];
}
