import { t } from "ttag";
import * as Yup from "yup";

export function formatMaskedKey(maskedKey: string) {
  return maskedKey.substring(0, 7) + "...";
}

export const getApiKeyValidationSchema = () =>
  Yup.object({
    name: Yup.string().required(),
    group_id: Yup.number()
      .typeError(t`Group is a required field`)
      .required(),
  });
