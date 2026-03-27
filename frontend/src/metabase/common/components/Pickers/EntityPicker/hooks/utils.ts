import { t } from "ttag";

import { collectionApi } from "metabase/api";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import type { DispatchFn } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getRootCollectionItem as getTransformsRootCollectionItem } from "metabase/transforms/utils";
import type { CollectionNamespace } from "metabase-types/api";

import type { OmniPickerCollectionItem } from "../types";
import { allCollectionModels } from "../utils";

export const getOurAnalytics = (): OmniPickerCollectionItem => ({
  model: "collection",
  id: "root",
  name: t`Our analytics`,
  here: ["collection"],
  below: allCollectionModels,
  can_write: true,
  namespace: null,
});

export const personalCollectionsRoot: OmniPickerCollectionItem = {
  ...PERSONAL_COLLECTIONS,
  can_write: false,
  model: "collection",
  location: "/",
  here: ["collection"],
  below: allCollectionModels,
};

export const getRootCollectionItem = async ({
  namespace,
  dispatch,
}: {
  namespace: CollectionNamespace;
  dispatch: DispatchFn;
}): Promise<OmniPickerCollectionItem> => {
  const rootCollectionFromApi = await fetchRootCollection(namespace, dispatch);
  const canWrite = rootCollectionFromApi?.can_write ?? false;

  const tenantRootItem = PLUGIN_TENANTS.getRootCollectionItem({ namespace });
  if (tenantRootItem) {
    return {
      can_write: canWrite,
      ...tenantRootItem,
    };
  }

  const transformRootItem = getTransformsRootCollectionItem({
    namespace,
  });
  if (transformRootItem) {
    return {
      ...transformRootItem,
      can_write: canWrite,
    };
  }

  if (namespace === "snippets") {
    return {
      model: "collection",
      id: "root",
      namespace: "snippets",
      location: "/",
      can_write: canWrite,
      name: t`SQL Snippets`,
      here: ["collection", "snippet"],
      below: ["collection", "snippet"],
    };
  }

  return {
    ...getOurAnalytics(),
    // if we failed to fetch our analytics, the user doesn't have access to it
    // so we just call it "Collections"
    ...(!rootCollectionFromApi ? { name: t`Collections` } : {}),
    can_write: canWrite,
  };
};

export const fetchRootCollection = async (
  namespace: CollectionNamespace,
  dispatch: DispatchFn,
) => {
  return dispatch(
    collectionApi.endpoints.getCollection.initiate({
      id: "root",
      namespace: namespace ?? undefined,
    }),
  )
    .unwrap()
    .catch(console.warn);
};
