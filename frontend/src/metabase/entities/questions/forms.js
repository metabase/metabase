import { t } from "ttag";
import { PLUGIN_CACHING } from "metabase/plugins";

const FORM_FIELDS = [
  { name: "name", title: t`Name` },
  {
    name: "description",
    title: t`Description`,
    type: "text",
    placeholder: t`It's optional but oh, so helpful`,
  },
];

export default {
  create: {
    fields: [
      ...FORM_FIELDS,
      {
        name: "collection_id",
        title: t`Collection`,
        type: "collection",
      },
    ],
  },
  edit: {
    fields: () =>
      [...FORM_FIELDS, PLUGIN_CACHING.cacheTTLFormField].filter(Boolean),
  },
};
