import { t } from "ttag";
import { PLUGIN_CACHING } from "metabase/plugins";

const FORM_FIELDS = [
  {
    name: "name",
    title: t`Name`,
    placeholder: t`What is the name of your dashboard?`,
    autoFocus: true,
    validate: name => (!name ? "Name is required" : null),
  },
  {
    name: "description",
    title: t`Description`,
    type: "text",
    placeholder: t`It's optional but oh, so helpful`,
  },
  {
    name: "collection_id",
    title: t`Which collection should this go in?`,
    type: "collection",
    validate: collectionId =>
      collectionId === undefined ? "Collection is required" : null,
  },
];

export default {
  create: {
    fields: FORM_FIELDS,
  },
  edit: {
    fields: () =>
      [...FORM_FIELDS, PLUGIN_CACHING.cacheTTLFormField].filter(Boolean),
  },
};
