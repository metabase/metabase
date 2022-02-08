import { t } from "ttag";
import validate from "metabase/lib/validate";

export default {
  create: {
    fields: [
      {
        name: "name",
        title: t`Timeline name`,
        placeholder: t`E.x. Product releases`,
        autoFocus: true,
        validate: validate.required().maxLength(100),
      },
      {
        name: "description",
        title: t`Description`,
        type: "text",
        validate: validate.maxLength(255),
      },
    ],
  },
};
