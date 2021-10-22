import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";

const FORM_FIELDS = [
  {
    name: "name",
    title: t`Name`,
    placeholder: t`What is the name of your dashboard?`,
    autoFocus: true,
    validate: name => (!name ? t`Name is required` : null),
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
      collectionId === undefined ? t`Collection is required` : null,
  },
];

export default {
  create: {
    fields: FORM_FIELDS,
  },
  edit: {
    fields: () => {
      const fields = [...FORM_FIELDS];
      if (
        MetabaseSettings.get("enable-query-caching") &&
        PLUGIN_CACHING.cacheTTLFormField
      ) {
        fields.push({
          ...PLUGIN_CACHING.cacheTTLFormField,
          type: "dashboardCacheTTL",
          message: t`Cache all question results for`,
        });
      }
      return fields;
    },
  },
};
