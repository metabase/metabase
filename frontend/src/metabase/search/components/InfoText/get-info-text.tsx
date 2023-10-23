import { t } from "ttag";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import type { WrappedResult } from "metabase/search/types";
import type { Collection } from "metabase-types/api";

export type InfoTextData = {
  link?: string | null;
  icon?: JSX.Element | null;
  label?: string | null;
};

export const getInfoText = (result: WrappedResult): InfoTextData | null => {
  if (result.model === "collection") {
    return getCollectionInfoText(result);
  }

  if (result.model === "database") {
    return getDatabaseInfoText();
  }

  if (result.model === "action") {
    return getActionInfoText(result);
  }

  return null;
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
