import { t } from "ttag";
import { PLUGIN_FORM_WIDGETS, PLUGIN_COLLECTIONS } from "metabase/plugins";
import { OFFICIAL_COLLECTION } from "./constants";

PLUGIN_COLLECTIONS.formFields = [
  ...PLUGIN_COLLECTIONS.formFields,
  {
    name: "authority_level",
    title: t`Collection type`,
    info: t`The contents of Official collections will get a badge by their name and will be more likely to show up in search results.`,
    options: [
      {
        name: t`Regular`,
        value: null,
        icon: "folder",
      },
      {
        name: t`Official`,
        value: OFFICIAL_COLLECTION.type,
        icon: OFFICIAL_COLLECTION.icon,
        selectedColor: OFFICIAL_COLLECTION.color,
      },
    ],
  },
];
