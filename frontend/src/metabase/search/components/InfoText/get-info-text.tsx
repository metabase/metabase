import { t } from "ttag";

import {
  collection as collectionUrl,
  dashboard as dashboardUrl,
} from "metabase/lib/urls";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import type { WrappedResult } from "metabase/search/types";
import { Box, Icon } from "metabase/ui";
import type { Collection } from "metabase-types/api";

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
    case "indexed-entity":
      return getActionInfoText(result);
    case "card":
      return getCardInfoText(result);
    case "dataset":
    default:
      return getCollectionResult(result);
  }
};

const getCardInfoText = (result: WrappedResult): InfoTextData => {
  if (result.dashboard) {
    return {
      label: result.dashboard.name,
      icon: (
        <Box ml="-1.5px" display="inherit" pos="relative" top="-0.5px">
          <Icon name="dashboard" size={12} />
        </Box>
      ),
      link: dashboardUrl(result.dashboard),
    };
  }

  return getCollectionResult(result);
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
  const type = PLUGIN_COLLECTIONS.getCollectionType(collection);
  return {
    label: `${type.name} ${t`Collection`}`,
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
            <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
              size={12}
              collection={collection}
            />
          </Box>
        ) : null,
        link: colUrl,
        label: collectionName,
      }
    : {};
};
