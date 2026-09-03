import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import Question, { type QuestionCreatorOpts } from "metabase-lib/v1/Question";
import type {
  DatabaseId,
  ParameterValuesMap,
  UnsavedCard,
} from "metabase-types/api";

import {
  type MetadataSelectorOpts,
  getMetadata,
  getMetadataUnfiltered,
} from "./selectors";

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
  Lib.metadataProvider(databaseId, getMetadata(state, opts));

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
  const metadata = getMetadata(state);
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
  const metadata = getMetadata(state);
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

/**
 * `selectMetadataProvider` over hidden tables and sensitive fields as well.
 */
export const selectMetadataProviderUnfiltered = (
  state: State,
  databaseId: DatabaseId | null,
): Lib.MetadataProvider =>
  Lib.metadataProvider(databaseId, getMetadataUnfiltered(state));

/**
 * `useMetadataProvider` over hidden tables and sensitive fields as well.
 */
export const useMetadataProviderUnfiltered = (
  databaseId: DatabaseId | null,
): Lib.MetadataProvider =>
  useSelector((state) => selectMetadataProviderUnfiltered(state, databaseId));

/**
 * A v1 `Question` for a card.
 *
 * The `Question` constructor takes the `Metadata` object, so building one
 * outside this module means holding that object.
 *
 * Takes `UnsavedCard`, which `Card` extends, because a question does not need
 * to be saved. What it does need is a `dataset_query`, so a `VirtualCard` (a
 * text, heading or link dashcard) is still rejected.
 */
export const selectQuestionFromCard = (
  state: State,
  card: UnsavedCard,
  parameterValues?: ParameterValuesMap,
): Question => new Question(card, getMetadata(state), parameterValues);

/**
 * A v1 `Question` for a draft that has no card yet, such as an ad-hoc query.
 */
export const selectQuestionFromOpts = (
  state: State,
  opts: Omit<QuestionCreatorOpts, "metadata">,
): Question => Question.create({ ...opts, metadata: getMetadata(state) });

/**
 * `selectQuestionFromCard` for components, as a builder rather than a question.
 *
 * A `Question` is a fresh object on every call, so a hook returning one would
 * re-render its component on every store action. The builder is memoised on
 * the `Metadata` object instead, which keeps it stable in a dependency array
 * and leaves the caller's own `useMemo` unchanged.
 */
type CardQuestionBuilder = (
  card: UnsavedCard,
  parameterValues?: ParameterValuesMap,
) => Question;

const cardQuestionBuilders = new WeakMap<Lib.Metadata, CardQuestionBuilder>();

/**
 * `selectQuestionFromCard` as a builder, for `createSelector` inputs and for
 * components. Memoised on the `Metadata` object so it is stable in a
 * dependency array and as a selector result.
 */
export const selectQuestionFromCardBuilder = (
  state: State,
): CardQuestionBuilder => {
  const metadata = getMetadata(state);
  const cached = cardQuestionBuilders.get(metadata);

  if (cached) {
    return cached;
  }

  const build = (card: UnsavedCard, parameterValues?: ParameterValuesMap) =>
    new Question(card, metadata, parameterValues);
  cardQuestionBuilders.set(metadata, build);

  return build;
};

export const useQuestionFromCard = (): CardQuestionBuilder =>
  useSelector(selectQuestionFromCardBuilder);

type DraftQuestionBuilder = (
  opts: Omit<QuestionCreatorOpts, "metadata">,
) => Question;

const draftQuestionBuilders = new WeakMap<Lib.Metadata, DraftQuestionBuilder>();

/**
 * `selectQuestionFromOpts` as a builder. A builder for the same reason as
 * `selectQuestionFromCardBuilder`.
 */
export const selectQuestionFromOptsBuilder = (
  state: State,
): DraftQuestionBuilder => {
  const metadata = getMetadata(state);
  const cached = draftQuestionBuilders.get(metadata);

  if (cached) {
    return cached;
  }

  const build = (opts: Omit<QuestionCreatorOpts, "metadata">) =>
    Question.create({ ...opts, metadata });
  draftQuestionBuilders.set(metadata, build);

  return build;
};

export const useQuestionFromOpts = (): DraftQuestionBuilder =>
  useSelector(selectQuestionFromOptsBuilder);
