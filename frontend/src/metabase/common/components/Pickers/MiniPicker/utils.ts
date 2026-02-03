import { useState } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { cardApi, collectionApi, databaseApi, tableApi } from "metabase/api";
import type { DispatchFn } from "metabase/lib/redux";
import { useDispatch } from "metabase/lib/redux";
import type { SchemaName } from "metabase-types/api";

import type { DataPickerValue } from "../DataPicker";

import {
  type MiniPickerCollectionItem,
  type MiniPickerFolderItem,
  MiniPickerFolderModel,
  type MiniPickerItem,
  type MiniPickerPickableItem,
  type MiniPickerTableItem,
} from "./types";

export const getOurAnalytics = (): MiniPickerFolderItem => ({
  model: "collection",
  id: "root" as any, // cmon typescript
  name: t`Our analytics`,
  here: ["card"],
  below: ["card"],
});

export function useGetPathFromValue({
  value,
  opened,
  libraryCollection,
}: {
  value?: DataPickerValue;
  opened: boolean;
  libraryCollection?: MiniPickerCollectionItem;
}) {
  const [path, setPath] = useState<MiniPickerFolderItem[]>([]);
  const [isLoadingPath, setIsLoadingPath] = useState(false);
  const dispatch = useDispatch();

  useDeepCompareEffect(() => {
    if (!opened || !value) {
      return;
    }
    setIsLoadingPath(true);

    getPathFromValue(value, dispatch, libraryCollection).then((newPath) => {
      setPath(newPath);
      setIsLoadingPath(false);
    });
  }, [value, opened, dispatch, libraryCollection]);

  return [path, setPath, { isLoadingPath }] as const;
}

async function getPathFromValue(
  value: DataPickerValue,
  dispatch: DispatchFn,
  libraryCollection?: MiniPickerCollectionItem,
): Promise<MiniPickerFolderItem[]> {
  if (value.model !== "table") {
    return getCollectionPathFromValue(value, dispatch, libraryCollection);
  }

  const table = await dispatch(
    tableApi.endpoints.getTable.initiate({ id: value.id }),
  ).unwrap();

  return table.collection == null
    ? getTablePathFromValue(
        {
          ...table,
          model: "table",
          table_schema: table.schema,
        },
        dispatch,
      )
    : getCollectionPathFromValue(value, dispatch, libraryCollection);
}

async function getTablePathFromValue(
  value: MiniPickerTableItem,
  dispatch: DispatchFn,
): Promise<MiniPickerFolderItem[]> {
  // get the list endpoints instead of the single table endpoint
  // so that they'll be in the cache when we navigate
  const dbReq = dispatch(
    databaseApi.endpoints.listDatabases.initiate(),
  ).unwrap();

  const schemaReq = dispatch(
    databaseApi.endpoints.listDatabaseSchemas.initiate({ id: value.db_id }),
  ).unwrap();

  const [dbs, schemas] = await Promise.all([dbReq, schemaReq]);
  const db = dbs.data.find((db) => db.id === value.db_id);
  const schema: SchemaName | undefined =
    schemas?.length > 1
      ? schemas.find((sch) => sch === value.table_schema)
      : undefined;
  return [
    ...(db ? [{ id: db.id, name: db.name, model: "database" as const }] : []),
    ...(db && schema
      ? [{ id: schema, name: schema, model: "schema" as const, dbId: db.id }]
      : []),
  ];
}

async function getCollectionPathFromValue(
  value: DataPickerValue,
  dispatch: DispatchFn,
  libraryCollection?: MiniPickerCollectionItem,
): Promise<MiniPickerFolderItem[]> {
  const table =
    value.model === "table"
      ? await dispatch(
          tableApi.endpoints.getTable.initiate({ id: value.id }),
        ).unwrap()
      : null;
  const card =
    value.model !== "table"
      ? await dispatch(
          cardApi.endpoints.getCard.initiate({ id: Number(value.id) }),
        ).unwrap()
      : null;

  const collection = table?.collection ?? card?.collection;

  const location = collection?.effective_location ?? collection?.location;

  if (!location) {
    return [getOurAnalytics()];
  }

  const locationPath = [getOurAnalytics()];

  const collectionIds = [
    "root",
    ...(location?.split("/") ?? []).map((id) => parseInt(id, 10)),
    collection?.id,
  ].filter(Boolean);

  if (collectionIds.includes(libraryCollection?.id)) {
    collectionIds.shift(); // pretend the library is at the top level
    locationPath.shift();
  }

  for (let i = 0; i < collectionIds.length; i++) {
    const collectionId = collectionIds[i];

    if (!collectionId) {
      break;
    }

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

  return locationPath;
}

// not a factory
export function getFolderAndHiddenFunctions(
  models: MiniPickerPickableItem["model"][],
  shouldHide?: (item: MiniPickerItem | unknown) => boolean,
) {
  const modelSet = new Set(models);
  const isFolder = (
    item: MiniPickerItem | unknown,
  ): item is MiniPickerFolderItem => {
    if (!item || typeof item !== "object" || !("model" in item)) {
      return false;
    }

    if (
      item.model === MiniPickerFolderModel.Database ||
      item.model === MiniPickerFolderModel.Schema
    ) {
      return true;
    }

    if (item.model !== MiniPickerFolderModel.Collection) {
      return false;
    }

    if (!("here" in item) && !("below" in item)) {
      return false;
    }

    const hereBelowSet = Array.from(
      new Set([
        ...("here" in item && Array.isArray(item.here) ? item.here : []),
        ...("below" in item && Array.isArray(item.below) ? item.below : []),
      ]),
    );
    return (
      item.model === "collection" &&
      hereBelowSet.some((hereBelowModel) => modelSet.has(hereBelowModel))
    );
  };

  const isHidden = (item: MiniPickerItem | unknown): item is unknown => {
    if (!item || typeof item !== "object" || !("model" in item)) {
      return true;
    }

    if (shouldHide && shouldHide(item)) {
      return true;
    }

    return (
      !modelSet.has(item.model as MiniPickerPickableItem["model"]) &&
      !isFolder(item)
    );
  };
  return { isFolder, isHidden };
}

export const focusFirstMiniPickerItem = () => {
  // any time the path changes, focus the first item
  setTimeout(() => {
    // dirty, but let's wait for a render
    const firstItem = document.querySelector(
      '[data-testid="mini-picker"] [role="menuitem"]',
    );
    if (firstItem) {
      (firstItem as HTMLElement)?.focus?.();
    }
  }, 10);
};
