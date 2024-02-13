import * as Yup from "yup";

export function formatMaskedKey(maskedKey: string) {
  return maskedKey.substring(0, 7) + "...";
}

export const API_KEY_VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(),
  group_id: Yup.number().required(),
});
