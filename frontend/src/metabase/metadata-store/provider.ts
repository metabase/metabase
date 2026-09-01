import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import type { DatabaseId } from "metabase-types/api";

import { type MetadataSelectorOpts, getMetadata } from "./selectors";

/**
 * The metabase-lib provider for a database, built from the mirror.
 *
 * The result is reference-stable for a given state and database, so callers
 * need no memoisation. `getMetadata` memoises the `Metadata` object, and
 * metabase-lib caches the provider on that object keyed by database id
 * (`metabase.lib.js.metadata/metadata-provider`).
 */
export const selectMetadataProvider = (
  state: State,
  databaseId: DatabaseId | null,
  opts?: MetadataSelectorOpts,
): Lib.MetadataProvider =>
  Lib.metadataProvider(databaseId, selectMetadata(state, opts));

/**
 * `getMetadata` is memoised per argument list, so `getMetadata(state)` and
 * `getMetadata(state, undefined)` return two different `Metadata` objects.
 * Two objects mean two metabase-lib caches and two parses of the same data.
 *
 * Call it with one argument when there are no options, which is what every
 * `useSelector(getMetadata)` caller already does.
 */
const selectMetadata = (state: State, opts?: MetadataSelectorOpts) =>
  opts ? getMetadata(state, opts) : getMetadata(state);

/**
 * `selectMetadataProvider` for components.
 *
 * Prefer this over reading `getMetadata` and calling `Lib.metadataProvider`,
 * so the v1 `Metadata` object stays inside this module. Code that cannot call
 * a hook, such as a thunk or a `connect` mapper, uses the selector directly.
 */
export const useMetadataProvider = (
  databaseId: DatabaseId | null,
  opts?: MetadataSelectorOpts,
): Lib.MetadataProvider =>
  useSelector((state) => selectMetadataProvider(state, databaseId, opts));

/**
 * A lookup from database id to provider, for callers that learn the database
 * only at call time, or need one provider per item in a list.
 *
 * A hook cannot be called in a loop, and `useMetadataProvider` wants its
 * database id up front, so neither serves those callers. This returns one
 * function instead, memoised on the `Metadata` object so that `useSelector`
 * sees a stable value and only re-renders when the metadata really changes.
 */
const providerFactories = new WeakMap<
  Lib.Metadata,
  (databaseId: DatabaseId | null) => Lib.MetadataProvider
>();

export const selectMetadataProviderFactory = (
  state: State,
): ((databaseId: DatabaseId | null) => Lib.MetadataProvider) => {
  const metadata = selectMetadata(state);
  const cached = providerFactories.get(metadata);

  if (cached) {
    return cached;
  }

  const factory = (databaseId: DatabaseId | null) =>
    Lib.metadataProvider(databaseId, metadata);
  providerFactories.set(metadata, factory);

  return factory;
};

/**
 * `selectMetadataProviderFactory` for components.
 */
export const useMetadataProviderFactory = (): ((
  databaseId: DatabaseId | null,
) => Lib.MetadataProvider) => useSelector(selectMetadataProviderFactory);

/**
 * Metric providers span databases, so they take no database id.
 *
 * Unlike `Lib.metadataProvider`, `LibMetric.metadataProvider` builds a fresh
 * provider on every call, and each one carries its own cache. Memoise on the
 * `Metadata` object so a provider survives as long as the metadata behind it.
 */
const metricProviders = new WeakMap<Lib.Metadata, LibMetric.MetadataProvider>();

export const selectMetricMetadataProvider = (
  state: State,
): LibMetric.MetadataProvider => {
  const metadata = selectMetadata(state);
  const cached = metricProviders.get(metadata);

  if (cached) {
    return cached;
  }

  const provider = LibMetric.metadataProvider(metadata);
  metricProviders.set(metadata, provider);

  return provider;
};

/**
 * `selectMetricMetadataProvider` for components.
 */
export const useMetricMetadataProvider = (): LibMetric.MetadataProvider =>
  useSelector(selectMetricMetadataProvider);

const UNFILTERED_OPTS: MetadataSelectorOpts = {
  includeHiddenTables: true,
  includeSensitiveFields: true,
};

/**
 * `selectMetadataProvider` over hidden tables and sensitive fields as well.
 */
export const selectMetadataProviderUnfiltered = (
  state: State,
  databaseId: DatabaseId | null,
): Lib.MetadataProvider =>
  selectMetadataProvider(state, databaseId, UNFILTERED_OPTS);

/**
 * `useMetadataProvider` over hidden tables and sensitive fields as well.
 */
export const useMetadataProviderUnfiltered = (
  databaseId: DatabaseId | null,
): Lib.MetadataProvider => useMetadataProvider(databaseId, UNFILTERED_OPTS);
