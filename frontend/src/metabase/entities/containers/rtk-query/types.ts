import type { State } from "metabase-types/store";

export type Selector<T> = (state: State, entityOptions: EntityOptions) => T;

export type RequestType = "fetch" | string;

export type EntityId = string | number;

export type EntityIdSelector = (state: State, props: unknown) => EntityId;

export type EntityQuery = any;

export type EntityQuerySelector = (state: State, props: unknown) => EntityQuery;

export type EntityType = "database" | "table" | string; // TODO

export type EntityTypeSelector = (state: State, props: unknown) => EntityType;

export interface EntityOptions {
  entityId: EntityId;
  requestType: RequestType;
}

export interface EntityDefinition {
  actions: {
    [actionName: string]: (...args: unknown[]) => unknown;
  };
  selectors: {
    getFetched: Selector<boolean>;
    getLoading: Selector<boolean>;
    getError: Selector<unknown | null>;
    [selectorName: string]: Selector<unknown>;
  };
}
