import { t } from "ttag";
import {
  PLUGIN_FORM_WIDGETS,
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { FormCollectionAuthorityLevel } from "./components/FormCollectionAuthorityLevel";
import { CollectionAuthorityLevelIcon } from "./components/CollectionAuthorityLevelIcon";
import { EE_AUTHORITY_LEVELS, OFFICIAL_COLLECTION } from "./constants";

PLUGIN_COLLECTIONS.AUTHORITY_LEVEL = {
  ...PLUGIN_COLLECTIONS.AUTHORITY_LEVEL,
  ...EE_AUTHORITY_LEVELS,
}

const {AUTHORITY_LEVEL} = PLUGIN_COLLECTIONS

PLUGIN_COLLECTIONS.formFields = [
  ...PLUGIN_COLLECTIONS.formFields,
  {
    name: "authority_level",
    title: t`Collection type`,
    info: t`The contents of Official collections will get a badge by their name and will be more likely to show up in search results.`,
    type: "collectionAuthorityLevel",
    options: [
      {
        name: t`Regular`,
        value: AUTHORITY_LEVEL.regular.type,
        icon: AUTHORITY_LEVEL.regular.icon,
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

PLUGIN_FORM_WIDGETS.collectionAuthorityLevel = FormCollectionAuthorityLevel;

PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon = CollectionAuthorityLevelIcon;
