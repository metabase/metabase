import { t } from "ttag";

import { createEntity } from "metabase/lib/entities";
import validate from "metabase/lib/validate";

export default createEntity({
  name: "snippets",
  nameOne: "snippet",
  path: "/api/native-query-snippet",
  form: {
    fields: [
      {
        name: "content",
        title: t`Enter some SQL here so you can reuse it later`,
        placeholder: "AND canceled_at IS null\nAND account_type = 'PAID'",
        type: "text",
        className:
          "Form-input full text-monospace text-normal text-small bg-light text-spaced",
        rows: 4,
        validate: validate.required().maxLength(10000),
      },
      {
        name: "name",
        title: t`Give your snippet a name`,
        placeholder: t`Current Customers`,
        validate: validate.required().maxLength(100),
      },
      {
        name: "description",
        title: t`Add a description`,
        placeholder: t`It's optional but oh, so helpful`,
        validate: validate.maxLength(500),
      },
    ],
  },
});
