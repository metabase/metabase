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

PLUGIN_COLLECTIONS.getAuthorityLevelMenuItems = (collection, onUpdate) => {
  if (isRegularCollection(collection)) {
    return [
      {
        title: t`Make collection official`,
        icon: OFFICIAL_COLLECTION.icon,
        action: () =>
          onUpdate(collection, {
            authority_level: OFFICIAL_COLLECTION.type,
          }),
      },
    ];
  } else {
    return [
      {
        title: t`Remove Official badge`,
        icon: "close",
        action: () =>
          onUpdate(collection, {
            authority_level: REGULAR_COLLECTION.type,
          }),
      },
    ];
  }
};

PLUGIN_COLLECTIONS.getAuthorityLevelFormFields = () => [
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
];

PLUGIN_FORM_WIDGETS.collectionAuthorityLevel = FormCollectionAuthorityLevel;

PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon =
  CollectionAuthorityLevelIcon;
