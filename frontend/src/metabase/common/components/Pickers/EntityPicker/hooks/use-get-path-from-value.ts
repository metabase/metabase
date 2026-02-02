import { useState } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import {
  cardApi,
  collectionApi,
  dashboardApi,
  databaseApi,
  documentApi,
  snippetApi,
  tableApi,
} from "metabase/api";
import { useGetPersonalCollection } from "metabase/common/hooks/use-get-personal-collection";
import { type DispatchFn, useDispatch } from "metabase/lib/redux";
import { PLUGIN_DATA_STUDIO, PLUGIN_TRANSFORMS } from "metabase/plugins";
import type {
  Collection,
  CollectionNamespace,
  LibraryCollection,
  SchemaName,
} from "metabase-types/api";

import type {
  EntityPickerOptions,
  OmniPickerCollectionItem,
  OmniPickerCollectionItemValue,
  OmniPickerDbValue,
  OmniPickerItem,
  OmniPickerTableValue,
  OmniPickerValue,
} from "../types";
import { getCollectionItemsOptions, validCollectionModels } from "../utils";

import { getRootCollectionItem, personalCollectionsRoot } from "./utils";
const allCollectionModels = Array.from(validCollectionModels);

const getDefaultPath = async ({
  options,
  libraryCollection,
  namespaces,
  dispatch,
}: {
  options: EntityPickerOptions;
  libraryCollection?: LibraryCollection;
  namespaces: CollectionNamespace[];
  dispatch: DispatchFn;
}): Promise<OmniPickerItem[]> => {
  if (libraryCollection && options.hasLibrary) {
    const libraryChildrenResponse = await dispatch(
      collectionApi.endpoints.listCollectionItems.initiate({
        id: libraryCollection.id,
      }),
    ).unwrap();

    if (libraryChildrenResponse) {
      const firstChildCollection = libraryChildrenResponse.data.find(
        (item) => item.model === "collection",
      );
      // we might also want to check if this collection has any relevant models
      if (firstChildCollection) {
        return [libraryCollection, firstChildCollection];
      }
    }
  }
  if (options.hasDatabases) {
    const databases = await dispatch(
      databaseApi.endpoints.listDatabases.initiate(),
    ).unwrap();
    if (databases.data.length > 0) {
      return [getFakeDbCollection()];
    }
  }
  if (options.hasRecents) {
    return [getFakeRecentsCollection()];
  }
  if (options.hasRootCollection) {
    const namespace = namespaces[0];
    return [await getRootCollectionItem({ namespace, dispatch })];
  }
  return [];
};

export function useGetPathFromValue({
  value,
  options,
  namespaces,
  models,
}: {
  value?: OmniPickerValue;
  options: EntityPickerOptions;
  namespaces: CollectionNamespace[];
  models: OmniPickerCollectionItem["model"][];
}) {
  const [path, setPath] = useState<OmniPickerItem[]>([]);
  const [isLoadingPath, setIsLoadingPath] = useState(false);

  const dispatch = useDispatch();

  const { data: libraryCollection, isLoading: isLoadingLibraryCollection } =
    PLUGIN_DATA_STUDIO.useGetLibraryCollection();

  const { data: personalCollection, isLoading: isLoadingPersonalCollection } =
    useGetPersonalCollection();

  useDeepCompareEffect(() => {
    if (isLoadingLibraryCollection || isLoadingPersonalCollection) {
      return;
    }

    setIsLoadingPath(true);

    if (!value) {
      getDefaultPath({ options, libraryCollection, namespaces, dispatch }).then(
        (path) => {
          setPath(path);
          setIsLoadingPath(false);
        },
      );
      return;
    }

    getPathFromValue({
      value,
      dispatch,
      libraryCollection,
      personalCollection,
      models,
    }).then((newPath) => {
      setPath(newPath);
      setIsLoadingPath(false);
    });
  }, [
    value,
    dispatch,
    libraryCollection,
    isLoadingLibraryCollection,
    isLoadingPersonalCollection,
  ]);

  return [path, setPath, { isLoadingPath }] as const;
}

const isInDbPath = (item: OmniPickerValue): item is OmniPickerDbValue =>
  ["database", "schema", "table"].includes(item.model);

const isTableItem = (item: OmniPickerValue): item is OmniPickerTableValue =>
  item.model === "table" && !!item.id;

async function getPathFromValue({
  value,
  dispatch,
  libraryCollection,
  personalCollection,
  models,
}: {
  value: OmniPickerValue;
  dispatch: DispatchFn;
  libraryCollection?: LibraryCollection;
  personalCollection?: Collection;
  models: OmniPickerCollectionItem["model"][];
}): Promise<OmniPickerItem[]> {
  if (value.id === "databases") {
    return [getFakeDbCollection()];
  }

  if (value.id === "recents") {
    return [getFakeRecentsCollection()];
  }

  if (!isInDbPath(value)) {
    return getCollectionPathFromValue({
      value,
      dispatch,
      libraryCollection,
      personalCollection,
      models,
    });
  }

  if (!isTableItem(value)) {
    return getDbPathFromValue(value, dispatch);
  }

  // check if the table is in a collection
  const table = await dispatch(
    tableApi.endpoints.getTable.initiate({ id: value.id }),
  ).unwrap();

  return table.collection == null
    ? getDbPathFromValue(value, dispatch)
    : getCollectionPathFromValue({
        value,
        dispatch,
        libraryCollection,
        personalCollection,
        models,
      });
}

const getFakeDbCollection = (): OmniPickerItem => ({
  name: t`Databases`,
  id: "databases",
  model: "collection",
  here: ["table"],
  below: ["table"],
});

const getFakeRecentsCollection = (): OmniPickerItem => ({
  name: t`Recent items`,
  id: "recents",
  model: "collection",
  here: allCollectionModels,
  below: allCollectionModels,
});

// note: doesn't handle parsing a path from a schema only value since schemas don't have unique ids
async function getDbPathFromValue(
  value: OmniPickerValue,
  dispatch: DispatchFn,
): Promise<OmniPickerItem[]> {
  if (value.model === "database") {
    const dbReq = await dispatch(
      databaseApi.endpoints.listDatabases.initiate(),
    ).unwrap();
    const db = dbReq.data.find((db) => db.id === value.id);

    if (!db) {
      return [getFakeDbCollection()];
    }
    // by default, select the first schema
    const schemas = await dispatch(
      databaseApi.endpoints.listDatabaseSchemas.initiate({ id: db.id }),
    ).unwrap();

    const schema: SchemaName | undefined =
      schemas?.length > 1 ? schemas[0] : undefined;

    return db
      ? [
          getFakeDbCollection(),
          { id: db.id, name: db.name, model: "database" as const },
          // if there's only one schema, omit it
          ...(schema
            ? [
                {
                  id: schema,
                  name: schema,
                  model: "schema" as const,
                  database_id: db.id,
                },
              ]
            : []),
        ]
      : [getFakeDbCollection()];
  }

  if (!isTableItem(value)) {
    return [getFakeDbCollection()];
  }

  const table = await dispatch(
    tableApi.endpoints.getTable.initiate({ id: value.id }),
  ).unwrap();

  if (!table) {
    return [getFakeDbCollection()];
  }

  // need to get the list because we hide schemas if there's only one
  const schemas = await dispatch(
    databaseApi.endpoints.listDatabaseSchemas.initiate({ id: table.db_id }),
  ).unwrap();

  const schema: SchemaName | undefined =
    schemas?.length > 1
      ? schemas.find((sch) => sch === table.schema)
      : undefined;

  const schemaPathItem = schema
    ? [
        {
          id: schema,
          name: schema,
          model: "schema" as const,
          database_id: table.db_id,
        },
      ]
    : [];

  return [
    getFakeDbCollection(),
    { id: table.db_id, name: table.db?.name ?? t`Database`, model: "database" },
    ...schemaPathItem,
    { id: table.id, name: table.display_name, model: "table" },
  ];
}

const isCollection = (
  item: Collection | unknown,
  value: OmniPickerCollectionItemValue,
): item is Collection => {
  return (
    value.model === "collection" &&
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    // the payload for the root collection is totally different
    ("location" in item || item.id === "root")
  );
};

const getNamespace = (
  item: Awaited<ReturnType<typeof getItemByModel>>,
): CollectionNamespace | undefined => {
  if (!item || typeof item !== "object") {
    return undefined;
  }

  if ("namespace" in item) {
    return item.namespace as CollectionNamespace;
  }
  if (
    "collection" in item &&
    typeof item.collection === "object" &&
    !!item.collection &&
    "namespace" in item.collection
  ) {
    return item.collection?.namespace as CollectionNamespace;
  }

  if ("collection_namespace" in item) {
    return item.collection_namespace as CollectionNamespace;
  }
  return undefined;
};

async function getCollectionPathFromValue({
  value,
  dispatch,
  libraryCollection,
  personalCollection,
  models,
}: {
  value: OmniPickerCollectionItemValue;
  dispatch: DispatchFn;
  libraryCollection?: LibraryCollection;
  personalCollection?: Collection;
  models: OmniPickerCollectionItem["model"][];
}): Promise<OmniPickerItem[]> {
  if (value.id === null || value.id === "root") {
    // if a root was passed, just return the root collection item
    const rootCollectionItem = await getRootCollectionItem({
      namespace: value.namespace ?? null,
      dispatch,
    });
    return [rootCollectionItem];
  }

  const item = await getItemByModel(value, dispatch).catch(console.error);
  if (!item) {
    return [];
  }

  const isCollectionValue = isCollection(item, value);
  const parentCollectionId = isCollectionValue ? item.id : item?.collection_id;

  const itemNamespace = value.namespace ?? getNamespace(item);

  const rootCollectionItem = await getRootCollectionItem({
    namespace: itemNamespace ?? null,
    dispatch,
  });

  const collection = isCollectionValue
    ? item
    : await dispatch(
        collectionApi.endpoints.getCollection.initiate({
          id: parentCollectionId ?? "root",
        }),
      ).unwrap();

  const location = collection?.effective_location ?? collection?.location;

  const locationPath = [rootCollectionItem];

  if (!location) {
    if (item && !isCollectionValue) {
      locationPath.push({
        id: item.id,
        name: item.name,
        model: value.model,
      });
    }
    return locationPath;
  }

  const collectionIds = [
    "root",
    ...(location?.split("/") ?? []).map((id) => Number(id)),
    collection?.id,
  ].filter(Boolean);

  const isInLibrary =
    libraryCollection?.id && collectionIds.includes(libraryCollection.id);

  const isInPersonalCollection =
    personalCollection?.id && collectionIds.includes(personalCollection.id);

  const isInOtherUserPersonalCollection =
    collection.is_personal && !isInPersonalCollection;

  // pretend special collections are at the top level
  if (
    isInPersonalCollection ||
    isInOtherUserPersonalCollection ||
    isInLibrary
  ) {
    collectionIds.shift();
    locationPath.shift();

    if (isInLibrary && libraryCollection) {
      locationPath.push({
        id: libraryCollection.id,
        name: libraryCollection.name,
        model: "collection",
        below: allCollectionModels,
      });
    } else if (isInPersonalCollection && personalCollection) {
      locationPath.push({
        id: personalCollection.id,
        name: personalCollection.name,
        model: "collection",
        below: allCollectionModels,
        can_write: true,
      });
    } else if (isInOtherUserPersonalCollection) {
      // need to fetch all personal collections to find the right one
      locationPath.push(personalCollectionsRoot);
      const personalCollections = await dispatch(
        collectionApi.endpoints.listCollections.initiate({
          "personal-only": true,
        }),
      ).unwrap();

      const basePersonalCollectionId = collectionIds[0];
      const otherUserPersonalCollection = personalCollections.find(
        (col: Collection) => col.id === basePersonalCollectionId,
      );
      if (otherUserPersonalCollection) {
        locationPath.push({
          id: otherUserPersonalCollection.id,
          name: otherUserPersonalCollection.name,
          can_write: otherUserPersonalCollection.can_write,
          model: "collection",
          here: allCollectionModels,
          below: allCollectionModels,
        });
      }
    }
  }

  for (let i = 0; i < collectionIds.length; i++) {
    // for loop to get sequential requests
    const collectionId = collectionIds[i];

    if (!collectionId) {
      break;
    }

    // use items endpoint to warm the cache
    const collectionItems = await dispatch(
      collectionApi.endpoints.listCollectionItems.initiate({
        id: collectionId,
        namespace: itemNamespace ?? undefined,
        ...getCollectionItemsOptions({ models }),
      }),
    )
      .unwrap()
      .catch(console.error);

    if (!collectionItems?.data) {
      break;
    }

    const nextItem = collectionItems.data.find(
      (item) => item.model === "collection" && item.id === collectionIds[i + 1],
    );

    if (!nextItem) {
      break;
    }

    locationPath.push({
      id: nextItem.id,
      name: nextItem.name,
      model: "collection",
      namespace: nextItem.namespace,
      can_write: nextItem.can_write,
      here: nextItem.here,
      below: nextItem.below,
    });
  }

  if (item && !isCollectionValue) {
    locationPath.push({
      id: item.id,
      name: item.name,
      model: value.model,
      ...("can_write" in item ? { can_write: item.can_write } : {}),
    });
  }
  return locationPath;
}

function getItemByModel(value: OmniPickerValue, dispatch: DispatchFn) {
  switch (value.model) {
    case "table":
      return dispatch(
        tableApi.endpoints.getTable.initiate({ id: value.id }),
      ).unwrap();
    case "card":
    case "dataset":
    case "metric":
      return dispatch(
        cardApi.endpoints.getCard.initiate({ id: Number(value.id) }),
      ).unwrap();
    case "collection":
      return dispatch(
        collectionApi.endpoints.getCollection.initiate({
          id: value.id,
          namespace: value.namespace ?? undefined,
        }),
      ).unwrap();
    case "dashboard":
      return dispatch(
        dashboardApi.endpoints.getDashboard.initiate({ id: value.id }),
      ).unwrap();
    case "document":
      return dispatch(
        documentApi.endpoints.getDocument.initiate({ id: Number(value.id) }),
      ).unwrap();
    case "snippet":
      return dispatch(
        snippetApi.endpoints.getSnippet.initiate(Number(value.id)),
      ).unwrap();
    case "transform":
      return dispatch(
        // @ts-expect-error - FIXME: this is a nightmare to type, and it's moving to OSS anyway
        PLUGIN_TRANSFORMS.transformApi.endpoints.getTransform.initiate(
          Number(value.id),
        ),
      ).unwrap();
    default:
      return Promise.resolve(null);
  }
}
