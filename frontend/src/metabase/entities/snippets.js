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
        updateInputProps: ({ className }) => ({
          className: className + " text-code",
          rows: 4,
        }),
        validate: validate.required().maxLength(10000),
      },
      {
        name: "name",
        title: t`Give your snippet a name`,
        placeholder: "current customers",
        validate: validate.required().maxLength(100),
      },
      {
        name: "description",
        title: t`Give it a description (optional)`,
        placeholder: "Filters accounts to current customers",
        validate: validate.maxLength(100),
      },
      { name: "database_id", hidden: true },
    ],
  },
});
