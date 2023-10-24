import { t } from "ttag";
import {
  PLUGIN_COLLECTION_COMPONENTS,
  PLUGIN_COLLECTIONS,
} from "metabase/plugins";
import type { WrappedResult } from "metabase/search/types";
import type { Collection } from "metabase-types/api";
import { collection as collectionUrl } from "metabase/lib/urls";

import { Box } from "metabase/ui";

const { CollectionAuthorityLevelIcon } = PLUGIN_COLLECTION_COMPONENTS;

export type InfoTextData = {
  link?: string | null;
  icon?: JSX.Element | null;
  label?: string | null;
};

export const getInfoText = (result: WrappedResult): InfoTextData => {
  switch (result.model) {
    case "collection":
      return getCollectionInfoText(result);
    case "database":
      return getDatabaseInfoText();
    case "action":
      return getActionInfoText(result);
    case "card":
    case "dataset":
    case "indexed-entity":
    default:
      return getCollectionResult(result);
  }
};
const getActionInfoText = (result: WrappedResult): InfoTextData => {
  return {
    label: result.model_name,
  };
};
const getDatabaseInfoText = (): InfoTextData => {
  return {
    label: t`Database`,
  };
};
const getCollectionInfoText = (result: WrappedResult): InfoTextData => {
  const collection: Partial<Collection> = result.getCollection();

  if (
    PLUGIN_COLLECTIONS.isRegularCollection(collection) ||
    !collection.authority_level
  ) {
    return {
      label: t`Collection`,
    };
  }
  const level = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[collection.authority_level];
  return {
    label: `${level.name} ${t`Collection`}`,
  };
};

const getCollectionResult = (result: WrappedResult): InfoTextData => {
  const collection = result.getCollection();
  const colUrl = collectionUrl(collection);
  const collectionName = collection.name;
  return collectionName
    ? {
        icon: collection.authority_level ? (
          <Box ml="-1.5px" display="inherit" pos="relative" top="-0.5px">
            <CollectionAuthorityLevelIcon size={12} collection={collection} />
          </Box>
        ) : null,
        link: colUrl,
        label: collectionName,
      }
    : {};
};
