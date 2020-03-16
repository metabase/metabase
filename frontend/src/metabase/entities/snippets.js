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
        name: "name",
        title: t`Name`,
        placeholder: "current customers",
        validate: validate.required().maxLength(100),
      },
      {
        name: "description",
        title: t`Description`,
        placeholder: "Filters accounts to current customers",
        validate: validate.maxLength(100),
      },
      {
        name: "content",
        title: t`Content`,
        placeholder: "canceled_at is null\nAND account_type = 'PAID'",
        validate: validate.required().maxLength(10000),
      },
      { name: "database_id", normalize: parseInt },
    ],
  },
});
