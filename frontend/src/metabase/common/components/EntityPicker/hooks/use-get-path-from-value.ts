
import { useState } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { cardApi, collectionApi, dashboardApi, databaseApi, documentApi, snippetApi, tableApi } from "metabase/api";
import { useGetPersonalCollection } from "metabase/common/hooks/use-get-personal-collection";
import { type DispatchFn, useDispatch } from "metabase/lib/redux";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import type { Collection, SchemaName } from "metabase-types/api";

import type { OmniPickerCollectionItem, OmniPickerCollectionItemValue, OmniPickerDbValue, OmniPickerItem, OmniPickerTableValue, OmniPickerValue } from "../types";
import { validCollectionModels } from "../utils";
const allCollectionModels = Array.from(validCollectionModels);

export const getOurAnalytics = (): OmniPickerCollectionItem => ({
  model: "collection",
  id: "root",
  name: t`Our analytics`,
  here: ["collection"],
  below: allCollectionModels,
});

export function useGetPathFromValue({
  value,
}: {
  value?: OmniPickerValue;
}) {
  const [path, setPath] = useState<OmniPickerItem[]>([]);
  const [isLoadingPath, setIsLoadingPath] = useState(false);

  const dispatch = useDispatch();

  const {
    data: libraryCollection,
    isLoading: isLoadingLibraryCollection,
  } = PLUGIN_DATA_STUDIO.useGetLibraryCollection({ skip: !value });

  const {
    data: personalCollection,
    isLoading: isLoadingPersonalCollection,
  } = useGetPersonalCollection();

  useDeepCompareEffect(() => {
    if (!value || isLoadingLibraryCollection || isLoadingPersonalCollection) {
      return;
    }
    setIsLoadingPath(true);

    getPathFromValue(value, dispatch, { libraryCollection, personalCollection }).then((newPath) => {
      setPath(newPath);
      setIsLoadingPath(false);
    });
  }, [value, dispatch, libraryCollection, isLoadingLibraryCollection]);

  return [path, setPath, { isLoadingPath }] as const;
}

const isInDbPath = (item: OmniPickerValue): item is OmniPickerDbValue =>
  ["database", "schema", "table"].includes(item.model);

const isTableItem = (item: OmniPickerValue): item is OmniPickerTableValue =>
  item.model === "table";

async function getPathFromValue(
  value: OmniPickerValue,
  dispatch: DispatchFn,
  specialCollections: { libraryCollection?: OmniPickerCollectionItem; personalCollection?: Collection } ,
): Promise<OmniPickerItem[]> {
  if (!isInDbPath(value)) {
    return getCollectionPathFromValue(value, dispatch, specialCollections);
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
    : getCollectionPathFromValue(value, dispatch, specialCollections);
}

const getFakeDbCollection = (): OmniPickerItem => ({
  name: t`Databases`,
  id: "databases",
  model: "collection",
  here: ['table'],
  below: ['table'],
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

    return db ? [
      getFakeDbCollection(),
      { id: db.id, name: db.name, model: "database" as const },
      // if there's only one schema, omit it
      ...(schema
          ? [{ id: schema, name: schema, model: "schema" as const, db_id: db.id }]
          : []
      ),
    ] : [getFakeDbCollection()];
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
    ? [{ id: schema, name: schema, model: "schema" as const, db_id: table.db_id }]
    : [];

  return [
    getFakeDbCollection(),
    { id: table.db_id, name: table.db?.name ?? t`Database`, model: "database" },
    ...schemaPathItem,
    { id: table.id, name: table.display_name, model: "table" },
  ];
}

const isCollection = (item: Collection | unknown): item is Collection => {
  return (
    typeof item === "object" &&
    item !== null &&
    "location" in item &&
    "is_personal" in item
  );
}

async function getCollectionPathFromValue(
  value: OmniPickerCollectionItemValue,
  dispatch: DispatchFn,
  specialCollections: { libraryCollection?: OmniPickerCollectionItem; personalCollection?: Collection }
): Promise<OmniPickerItem[]> {
  const item = await getItemByModel(value, dispatch);
  const collectionId = isCollection(item)
    ? item.id
    : item?.collection_id;

  if (!collectionId) {
    return [];
  }

  const collection = isCollection(item)
    ? item
    : await dispatch(
        collectionApi.endpoints.getCollection.initiate({ id: collectionId }),
      ).unwrap();

  const location = collection?.location;

  const locationPath = [getOurAnalytics()];

  if (!location) {
    return locationPath;
  }

  const collectionIds = [
    "root",
    ...(location?.split("/") ?? []).map((id) => Number(id)),
    collection?.id,
  ].filter(Boolean);

  const isInLibrary = specialCollections?.libraryCollection?.id &&
    collectionIds.includes(specialCollections.libraryCollection.id);

  const isInPersonalCollection = specialCollections?.personalCollection?.id &&
    collectionIds.includes(specialCollections.personalCollection.id)

  // pretend special collections are at the top level
  if ( isInPersonalCollection || isInLibrary) {
    collectionIds.shift();
    locationPath.shift();

    if (isInLibrary && specialCollections.libraryCollection) {
      locationPath.push({
        id: specialCollections.libraryCollection.id,
        name: specialCollections.libraryCollection.name,
        model: "collection",
        below: allCollectionModels,
      });
    } else if (isInPersonalCollection && specialCollections.personalCollection) {
      locationPath.push({
        id: specialCollections.personalCollection.id,
        name: specialCollections.personalCollection.name,
        model: "collection",
        below: allCollectionModels,
      });
    }
  }

  for (let i = 0; i < collectionIds.length; i++) { // for loop to get sequential requests
    const collectionId = collectionIds[i];

    if (!collectionId) {
      break;
    }

    // use items endpoint to warm the cache
    const collectionItems = await dispatch(
      collectionApi.endpoints.listCollectionItems.initiate({
        id: collectionId,
      }),
    ).unwrap();

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
      here: nextItem.here,
      below: nextItem.below,
    });
  }

  if (item && !isCollection(item)) {
    locationPath.push({
      id: item.id,
      name: item.name,
      model: value.model,
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
      return dispatch(cardApi.endpoints.getCard.initiate({ id: Number(value.id) })).unwrap();
    case "collection":
      return dispatch(
        collectionApi.endpoints.getCollection.initiate({ id: value.id }),
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
    default:
      return Promise.resolve(null);
  }
}
