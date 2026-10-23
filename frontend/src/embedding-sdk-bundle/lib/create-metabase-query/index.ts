import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type DynamicQueryInput,
  type QueryInput,
  isQueryInput,
  isQuestionInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { QuestionSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { cardApi, selectCard, selectTableQueryMetadata } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { selectMetadataProviderUnfiltered } from "metabase/metadata-store";
import { fetchTableMetadataAndForeignKeys } from "metabase/redux/tables";
import * as Lib from "metabase-lib";
import type {
  Card,
  DatasetQuery,
  TestBreakoutSpec,
  TestColumnSpec,
  TestExpressionSpec,
  TestOperatorArgSpec,
  TestQuerySpec,
  TestStageSpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { loadReferencedMetricMetadata } from "./metric-metadata";
import {
  validateDynamicQuery,
  validateQueryInput,
  validateUniqueColumnNames,
} from "./validation";

export type ResolveDatasetQuery = (
  store: SdkStore,
) => (
  input: QueryInput,
  dynamicQuery?: DynamicQueryInput,
) => Promise<DatasetQuery>;

export const resolveDatasetQuery: ResolveDatasetQuery =
  (store) => async (input: QueryInput, dynamicQuery?: DynamicQueryInput) => {
    if (!isQueryInput(input)) {
      throw new Error(
        'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
      );
    }

    const { input: sourceInput, card: sourceCard } = await resolveSourceCard(
      store,
      input,
    );

    validateQueryInput(sourceInput);
    validateDynamicQuery(dynamicQuery);

    await loadSourceMetadata(store, sourceInput, sourceCard);

    return resolveQueryFromLoadedMetadata(
      sourceInput,
      dynamicQuery,
      store.getState(),
      sourceCard,
    );
  };

type SdkState = ReturnType<SdkStore["getState"]>;

type ResolvedSource = {
  input: QueryInput;
  card?: Card;
};

/**
 * A card source given by its entity ID, with the card's numeric id: query
 * metadata and the query itself address cards by numeric id.
 */
async function resolveSourceCard(
  store: SdkStore,
  input: QueryInput,
): Promise<ResolvedSource> {
  if (!isQuestionInput(input) || input.source.id !== undefined) {
    return { input };
  }

  const card = await fetchCardByEntityId(store, input.source.entityId);

  return {
    input: { ...input, source: { ...input.source, id: card.id } },
    card,
  };
}

async function fetchCardByEntityId(
  store: SdkStore,
  entityId: string,
): Promise<Card> {
  try {
    return await runRtkEndpoint(
      { id: entityId },
      store.dispatch,
      cardApi.endpoints.getCard,
      { forceRefetch: false },
    );
  } catch (error) {
    if (isObject(error) && error.status === 404) {
      throw new Error(
        `Saved question ${entityId} does not exist. Fetch the app's typed schema again to pick up its current questions.`,
      );
    }

    throw error;
  }
}

function getQuestionId(source: QuestionSchema): number {
  if (source.id === undefined) {
    throw new Error(`Saved question ${source.entityId} was not resolved.`);
  }

  return source.id;
}

function resolveQueryFromLoadedMetadata(
  input: QueryInput,
  dynamicQuery: DynamicQueryInput | undefined,
  state: SdkState,
  sourceCard: Card | undefined,
) {
  if (!isQueryInput(input)) {
    throw new Error(
      'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
    );
  }

  const databaseId = getSourceDatabaseId(input, state, sourceCard);
  const provider = selectMetadataProviderUnfiltered(state, databaseId);
  const sourceStage = toStageSpec(input);

  // Merged into the source stage, the dynamic clauses would run before its
  // aggregation; as their own stage they act on its result columns.
  const dynamicStage = dynamicQuery && toResultColumnStageSpec(dynamicQuery);

  validateUniqueColumnNames(
    Lib.createTestQuery(provider, {
      stages: dynamicStage
        ? [withoutOrderBys(sourceStage), withoutOrderBys(dynamicStage)]
        : [withoutOrderBys(sourceStage)],
    } satisfies TestQuerySpec),
  );

  const query = Lib.createTestQuery(provider, {
    stages: dynamicStage ? [sourceStage, dynamicStage] : [sourceStage],
  } satisfies TestQuerySpec);

  const datasetQuery = Lib.toJsQuery(query);

  // Lib reads the database off the metadata provider, and a user who may read a
  // card but not create queries gets none from `/api/card/:id/query_metadata` —
  // so the query comes back without `:database`, which `/api/dataset` rejects.
  // The source itself carries the id, so set it explicitly.
  return { ...datasetQuery, database: databaseId };
}

function withoutOrderBys<TStage extends TestStageSpec>({
  orderBys: _orderBys,
  ...stage
}: TStage) {
  return stage;
}

function toStageSpec(input: QueryInput): TestStageWithSourceSpec {
  if (!isQuestionInput(input)) {
    return input;
  }

  return {
    source: { type: "card", id: getQuestionId(input.source) },
    ...toResultColumnStageSpec(input),
  };
}

/**
 * A stage whose dimensions are the previous stage's result columns — a card
 * stage or a dynamic stage. Both resolve their columns by name.
 */
function toResultColumnStageSpec({
  filters,
  aggregations,
  breakouts,
  orderBys,
  limit,
}: DynamicQueryInput): TestStageSpec {
  return {
    ...(filters && { filters: filters.map(toResultColumnExpressionSpec) }),
    ...(aggregations && {
      aggregations: aggregations.map(toResultColumnExpressionSpec),
    }),
    ...(breakouts && { breakouts: breakouts.map(toResultBreakoutSpec) }),
    ...(orderBys && { orderBys: orderBys.map(toResultColumnSpec) }),
    ...(limit != null && { limit }),
  };
}

// A card stage exposes the saved question's result columns, which are no
// longer joined, so the join and foreign key keys are dropped. The field ID is
// dropped too, as it differs between the instance an app is built against and
// the one it runs on; the name finds the column.
function toResultColumnSpec<TSpec extends TestColumnSpec>(spec: TSpec) {
  const {
    fieldId: _fieldId,
    joinAlias: _joinAlias,
    sourceFieldId: _sourceFieldId,
    sourceFieldJoinAlias: _sourceFieldJoinAlias,
    ...resultColumn
  } = spec;

  return resultColumn;
}

function toResultBreakoutSpec(spec: TestBreakoutSpec): TestBreakoutSpec {
  if (spec.type === "breakout") {
    return { ...spec, column: toResultColumnSpec(spec.column) };
  }

  return toResultColumnSpec(spec);
}

function toResultColumnExpressionSpec(
  spec: TestExpressionSpec,
): TestExpressionSpec {
  if (spec.type === "column") {
    return toResultColumnSpec(spec);
  }

  if (spec.type === "operator") {
    return { ...spec, args: spec.args?.map(toResultColumnArgSpec) };
  }

  return spec;
}

function toResultColumnArgSpec(spec: TestOperatorArgSpec): TestOperatorArgSpec {
  if (
    spec.type === "segment" ||
    spec.type === "measure" ||
    spec.type === "metric"
  ) {
    return spec;
  }

  return toResultColumnExpressionSpec(spec);
}

async function loadSourceMetadata(
  store: SdkStore,
  input: QueryInput,
  sourceCard: Card | undefined,
) {
  if (isQuestionInput(input)) {
    const cardId = getQuestionId(input.source);

    await (sourceCard
      ? loadCardQueryMetadata(store, cardId)
      : loadCardMetadata(store, cardId));
    return;
  }

  if (isTableInput(input)) {
    await store.dispatch(
      fetchTableMetadataAndForeignKeys({ id: input.source.id }),
    );
    await loadReferencedMetricMetadata(store, input);
  }
}

async function loadCardMetadata(store: SdkStore, id: number) {
  await Promise.all([
    runRtkEndpoint({ id }, store.dispatch, cardApi.endpoints.getCard, {
      forceRefetch: false,
    }),
    loadCardQueryMetadata(store, id),
  ]);
}

function loadCardQueryMetadata(store: SdkStore, id: number) {
  return runRtkEndpoint(
    id,
    store.dispatch,
    cardApi.endpoints.getCardQueryMetadata,
    { forceRefetch: false },
  );
}

function getSourceDatabaseId(
  input: QueryInput,
  state: SdkState,
  sourceCard: Card | undefined,
) {
  if (isTableInput(input)) {
    return getTableDatabaseId(input.source.id, state);
  }

  if (isQuestionInput(input)) {
    const cardId = getQuestionId(input.source);

    return getCardDatabaseId(
      cardId,
      sourceCard ?? selectCard({ id: cardId })(state).data,
    );
  }

  throw new Error("Unable to find database for query source.");
}

// Both sources were awaited by `loadSourceMetadata`, so they are in the RTK
// cache by now.
function getTableDatabaseId(tableId: number, state: SdkState) {
  const { data: table } = selectTableQueryMetadata({ id: tableId })(state);

  if (typeof table?.db_id === "number") {
    return table.db_id;
  }

  throw new Error(`Unable to find database for table ${tableId}.`);
}

function getCardDatabaseId(cardId: number, card: Card | undefined) {
  const databaseId = card?.dataset_query?.database;

  if (typeof databaseId === "number") {
    return databaseId;
  }

  throw new Error(`Unable to find database for saved question ${cardId}.`);
}
