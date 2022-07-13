import { t } from "ttag";
import { RadioOption } from "metabase/core/components/Radio/Radio";

export const OPTIONS: RadioOption<boolean>[] = [
  { name: t`True`, value: true },
  { name: t`False`, value: false },
];

export const EXPANDED_OPTIONS: RadioOption<string | boolean | any>[] = [
  { name: t`True`, value: true },
  { name: t`False`, value: false },
  { name: t`Empty`, value: "is-null" },
  { name: t`Not empty`, value: "not-null" },
];
