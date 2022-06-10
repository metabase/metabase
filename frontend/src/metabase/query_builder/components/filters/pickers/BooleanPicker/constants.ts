import { t } from "ttag";
import { RadioOption } from "metabase/core/components/Radio/Radio";

export const OPTIONS: RadioOption<boolean>[] = [
  { name: t`true`, value: true },
  { name: t`false`, value: false },
];

export const EXPANDED_OPTIONS: RadioOption<string | boolean | any>[] = [
  { name: t`true`, value: true },
  { name: t`false`, value: false },
  { name: t`empty`, value: "is-null" },
  { name: t`not empty`, value: "not-null" },
];
