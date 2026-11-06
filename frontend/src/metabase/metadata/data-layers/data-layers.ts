import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type {
  DatabaseId,
  IconName,
  SchemaId,
  SchemaName,
  TableId,
} from "metabase-types/api";
import { isObject, isStringRecord } from "metabase-types/guards";

export type DataLayerVisibility = "everyone" | "admins" | "hidden";

/** A database's data layer; the list order is its position, source to presentation. */
export type DataLayer = {
  id: string;
  name: string;
  visibility: DataLayerVisibility;
};

export const DATA_LAYER_VISIBILITY_ICONS: Record<
  DataLayerVisibility,
  IconName
> = {
  everyone: "globe",
  admins: "lock",
  hidden: "eye_crossed_out",
};

const DATA_LAYER_VISIBILITIES: DataLayerVisibility[] = [
  "everyone",
  "admins",
  "hidden",
];

export function getDataLayerVisibilityLabel(
  visibility: DataLayerVisibility,
): string {
  switch (visibility) {
    case "everyone":
      return t`Everyone`;
    case "admins":
      return t`Admins`;
    case "hidden":
      return t`Hidden`;
  }
}

export function getDataLayerVisibilityOptions(): {
  value: DataLayerVisibility;
  label: string;
}[] {
  return DATA_LAYER_VISIBILITIES.map((value) => ({
    value,
    label: getDataLayerVisibilityLabel(value),
  }));
}

/** Whether people see what's in a layer in browse: hidden layers are hidden from everyone. */
export function isDataLayerVisible(
  layer: DataLayer | undefined,
  { isAdmin }: { isAdmin: boolean },
): boolean {
  if (layer == null) {
    return true;
  }
  return (
    layer.visibility === "everyone" ||
    (layer.visibility === "admins" && isAdmin)
  );
}

const DEFAULT_SCHEMA_LAYER_ID = "final";

/** The three layers every database starts with. */
export function getSeedDataLayers(): DataLayer[] {
  return [
    { id: "hidden", name: t`Hidden`, visibility: "hidden" },
    { id: "internal", name: t`Internal`, visibility: "admins" },
    { id: DEFAULT_SCHEMA_LAYER_ID, name: t`Final`, visibility: "everyone" },
  ];
}

export function createDataLayer(): DataLayer {
  return {
    id: _.uniqueId(`data-layer-${Date.now()}-`),
    name: t`New layer`,
    visibility: "admins",
  };
}

/**
 * Where a deleted layer's schemas go: the nearest remaining layer toward the
 * source, or toward the presentation end if none is left before it.
 */
export function getFallbackDataLayer(
  layers: DataLayer[],
  index: number,
  isRemaining: (layer: DataLayer) => boolean = () => true,
): DataLayer | undefined {
  const before = layers.slice(0, index).reverse().find(isRemaining);
  return before ?? layers.slice(index + 1).find(isRemaining);
}

function getSchemaKey(
  databaseId: DatabaseId,
  schemaName: SchemaName,
): SchemaId {
  return `${databaseId}:${schemaName}`;
}

function getTableKey(databaseId: DatabaseId, tableId: TableId): string {
  return `${databaseId}:${tableId}`;
}

type DataLayersState = {
  layersByDatabase: Record<string, DataLayer[]>;
  layerIdBySchema: Record<SchemaId, string>;
  /** Tables without an entry use their schema's layer */
  layerIdByTable: Record<string, string>;
  /** Schemas without an entry show their raw name */
  displayNameBySchema: Record<SchemaId, string>;
};

/** A table's layer, and whether it comes from the table's schema */
export type ResolvedTableDataLayer = {
  layer: DataLayer | undefined;
  isInherited: boolean;
};

// PROTOTYPE: mocked. Until there's an API, layers and the schema and table
// settings that point at them live in localStorage, so Data Studio edits
// reach /browse and survive reloads.
const STORAGE_KEY = "metabase-prototype-data-layers";

function parseState(value: unknown): DataLayersState {
  if (!isObject(value) || !isLayersByDatabase(value.layersByDatabase)) {
    return {
      layersByDatabase: {},
      layerIdBySchema: {},
      layerIdByTable: {},
      displayNameBySchema: {},
    };
  }
  // State saved by earlier versions lacks the newer records
  return {
    layersByDatabase: value.layersByDatabase,
    layerIdBySchema: isStringRecord(value.layerIdBySchema)
      ? value.layerIdBySchema
      : {},
    layerIdByTable: isStringRecord(value.layerIdByTable)
      ? value.layerIdByTable
      : {},
    displayNameBySchema: isStringRecord(value.displayNameBySchema)
      ? value.displayNameBySchema
      : {},
  };
}

function isDataLayer(value: unknown): value is DataLayer {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    DATA_LAYER_VISIBILITIES.some(
      (visibility) => visibility === value.visibility,
    )
  );
}

function isLayersByDatabase(
  value: unknown,
): value is Record<string, DataLayer[]> {
  return (
    isObject(value) &&
    Object.values(value).every(
      (layers) => Array.isArray(layers) && layers.every(isDataLayer),
    )
  );
}

function getLayers(state: DataLayersState, databaseId: DatabaseId) {
  return state.layersByDatabase[databaseId] ?? getSeedDataLayers();
}

/**
 * Each database's layers, and each schema's layer and display name. Databases
 * start with the seed layers, and schemas with the Final layer.
 */
export function useDataLayers() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getDataLayers = useCallback(
    (databaseId: DatabaseId) => getLayers(state, databaseId),
    [state],
  );

  const getSchemaDataLayer = useCallback(
    (databaseId: DatabaseId, schemaName: SchemaName): DataLayer | undefined =>
      resolveSchemaLayer(state, databaseId, schemaName),
    [state],
  );

  /** Resolves table → schema → layer; an override to a missing layer is ignored */
  const getTableDataLayer = useCallback(
    (
      databaseId: DatabaseId,
      schemaName: SchemaName,
      tableId: TableId,
    ): ResolvedTableDataLayer => {
      const overrideId = state.layerIdByTable[getTableKey(databaseId, tableId)];
      const override = getLayers(state, databaseId).find(
        (layer) => layer.id === overrideId,
      );
      return override
        ? { layer: override, isInherited: false }
        : {
            layer: resolveSchemaLayer(state, databaseId, schemaName),
            isInherited: true,
          };
    },
    [state],
  );

  const getSchemaDisplayName = useCallback(
    (databaseId: DatabaseId, schemaName: SchemaName): string =>
      state.displayNameBySchema[getSchemaKey(databaseId, schemaName)] ??
      schemaName,
    [state],
  );

  const setDataLayers = useCallback(
    (databaseId: DatabaseId, layers: DataLayer[]) => {
      updateState((current) => {
        const previousLayers = getLayers(current, databaseId);
        const remainingIds = new Set(layers.map((layer) => layer.id));
        const isRemaining = (layer: DataLayer) => remainingIds.has(layer.id);
        const layerIdBySchema = { ...current.layerIdBySchema };
        // Tables set to a deleted layer go back to their schema's layer
        const layerIdByTable = Object.fromEntries(
          Object.entries(current.layerIdByTable).filter(
            ([tableKey, layerId]) =>
              !tableKey.startsWith(`${databaseId}:`) ||
              remainingIds.has(layerId),
          ),
        );

        // Move schemas out of deleted layers, as the delete confirmation says
        previousLayers.forEach((layer, index) => {
          const fallback = isRemaining(layer)
            ? undefined
            : getFallbackDataLayer(previousLayers, index, isRemaining);
          if (fallback == null) {
            return;
          }
          Object.entries(layerIdBySchema).forEach(([schemaKey, layerId]) => {
            if (
              layerId === layer.id &&
              schemaKey.startsWith(`${databaseId}:`)
            ) {
              layerIdBySchema[schemaKey] = fallback.id;
            }
          });
        });

        return {
          ...current,
          layersByDatabase: {
            ...current.layersByDatabase,
            [databaseId]: layers,
          },
          layerIdBySchema,
          layerIdByTable,
        };
      });
    },
    [updateState],
  );

  const setSchemaDataLayerId = useCallback(
    (databaseId: DatabaseId, schemaName: SchemaName, layerId: string) => {
      updateState((current) => ({
        ...current,
        layerIdBySchema: {
          ...current.layerIdBySchema,
          [getSchemaKey(databaseId, schemaName)]: layerId,
        },
      }));
    },
    [updateState],
  );

  /** `null` drops the override, so the table uses its schema's layer again */
  const setTableDataLayerId = useCallback(
    (databaseId: DatabaseId, tableId: TableId, layerId: string | null) => {
      const tableKey = getTableKey(databaseId, tableId);
      updateState((current) => ({
        ...current,
        layerIdByTable:
          layerId == null
            ? _.omit(current.layerIdByTable, tableKey)
            : { ...current.layerIdByTable, [tableKey]: layerId },
      }));
    },
    [updateState],
  );

  /** Clearing the display name, or setting it to the raw name, drops the override */
  const setSchemaDisplayName = useCallback(
    (databaseId: DatabaseId, schemaName: SchemaName, displayName: string) => {
      const schemaKey = getSchemaKey(databaseId, schemaName);
      updateState((current) => ({
        ...current,
        displayNameBySchema:
          displayName === "" || displayName === schemaName
            ? _.omit(current.displayNameBySchema, schemaKey)
            : { ...current.displayNameBySchema, [schemaKey]: displayName },
      }));
    },
    [updateState],
  );

  return {
    getDataLayers,
    setDataLayers,
    getSchemaDataLayer,
    setSchemaDataLayerId,
    getTableDataLayer,
    setTableDataLayerId,
    getSchemaDisplayName,
    setSchemaDisplayName,
  };
}

function resolveSchemaLayer(
  state: DataLayersState,
  databaseId: DatabaseId,
  schemaName: SchemaName,
): DataLayer | undefined {
  const layers = getLayers(state, databaseId);
  const layerId =
    state.layerIdBySchema[getSchemaKey(databaseId, schemaName)] ??
    DEFAULT_SCHEMA_LAYER_ID;
  return layers.find((layer) => layer.id === layerId) ?? layers.at(-1);
}
