import * as Yup from "yup";

export const API_KEY_VALIDATION_SCHEMA = Yup.object({
  name: Yup.string().required(),
  group_id: Yup.number().required(),
});
