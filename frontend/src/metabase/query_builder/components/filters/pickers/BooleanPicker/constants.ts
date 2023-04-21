import { t } from "ttag";

export const OPTIONS = [
  { name: t`True`, value: true },
  { name: t`False`, value: false },
];

export const EXPANDED_OPTIONS = [
  { name: t`True`, value: true },
  { name: t`False`, value: false },
  { name: t`Empty`, value: "is-null" },
  { name: t`Not empty`, value: "not-null" },
];
