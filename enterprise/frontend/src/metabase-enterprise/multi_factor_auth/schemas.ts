import { t } from "ttag";
import type * as Yup from "yup";

import * as Errors from "metabase/utils/errors";

import { TOTP_CODE_LENGTH } from "./constants";

export function withTotpCodeRules(schema: Yup.StringSchema) {
  return schema
    .matches(/^\d*$/, () => t`must contain only digits`)
    .length(TOTP_CODE_LENGTH, Errors.exactLength);
}
