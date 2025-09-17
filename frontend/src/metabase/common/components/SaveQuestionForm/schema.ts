import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";
import { QUESTION_NAME_MAX_LENGTH } from "metabase/questions/constants";

export const SAVE_QUESTION_SCHEMA = Yup.object({
  saveType: Yup.string().oneOf(["overwrite", "create"]),
  name: Yup.string().when("saveType", {
    // We don't care if the form is valid when overwrite mode is enabled,
    // as original question's data will be submitted instead of the form values
    is: (value: string) => value !== "overwrite",
    then: Yup.string()
      .required(Errors.required)
      .max(QUESTION_NAME_MAX_LENGTH, Errors.maxLength),
    otherwise: Yup.string().nullable(true),
  }),
});
