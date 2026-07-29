import { t } from "ttag";
import * as Yup from "yup";

export function formatMaskedKey(maskedKey: string) {
  return maskedKey.substring(0, 7) + "...";
}

export const API_KEY_VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(),
  group_id: Yup.number()
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    .typeError(t`Group is a required field`)
    .required(),
});
