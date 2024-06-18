import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";

export const LICENSE_TOKEN_SCHEMA = Yup.object({
  license_token: Yup.string()
    .test("license-token-test", Errors.exactLength({ length: 64 }), value =>
      Boolean(value?.length === 64 || value?.startsWith("airgap_")),
    )
    .required(Errors.required),
});
