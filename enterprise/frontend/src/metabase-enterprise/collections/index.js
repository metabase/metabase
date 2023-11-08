import { t } from "ttag";
import {
  PLUGIN_FORM_WIDGETS,
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { FormCollectionAuthorityLevel } from "./components/FormCollectionAuthorityLevel";
import { CollectionAuthorityLevelIcon } from "./components/CollectionAuthorityLevelIcon";
import {
  AUTHORITY_LEVELS,
  REGULAR_COLLECTION,
  OFFICIAL_COLLECTION,
} from "./constants";
import { isRegularCollection } from "./utils";

PLUGIN_COLLECTIONS.isRegularCollection = isRegularCollection;

PLUGIN_COLLECTIONS.REGULAR_COLLECTION = REGULAR_COLLECTION;

PLUGIN_COLLECTIONS.AUTHORITY_LEVEL = AUTHORITY_LEVELS;

PLUGIN_COLLECTIONS.authorityLevelFormFields = [
  {
    name: "authority_level",
    title: t`Collection type`,
    info: t`The contents of Official collections will get a badge by their name and will be more likely to show up in search results.`,
    type: "collectionAuthorityLevel",
    options: [
      {
        name: REGULAR_COLLECTION.name,
        value: REGULAR_COLLECTION.type,
        icon: REGULAR_COLLECTION.icon,
      },
      {
        name: OFFICIAL_COLLECTION.name,
        value: OFFICIAL_COLLECTION.type,
        icon: OFFICIAL_COLLECTION.icon,
        selectedColor: OFFICIAL_COLLECTION.color,
      },
    ],
  },
  {
    name: "update_collection_tree_authority_level",
    type: "hidden",
  },
];

PLUGIN_FORM_WIDGETS.collectionAuthorityLevel = FormCollectionAuthorityLevel;

PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon = CollectionAuthorityLevelIcon;
