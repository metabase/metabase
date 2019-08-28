/* @flow weak */

import _ from "underscore";
import { chain, assoc, assocIn } from "icepick";

// NOTE: the order of these matters due to circular dependency issues
import StructuredQuery, {
  STRUCTURED_QUERY_TEMPLATE,
} from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery, {
  NATIVE_QUERY_TEMPLATE,
} from "metabase-lib/lib/queries/NativeQuery";
import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";

import Query from "metabase-lib/lib/queries/Query";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";

import {
  AggregationDimension,
  DatetimeFieldDimension,
  BinnedDimension,
} from "metabase-lib/lib/Dimension";
import Mode from "metabase-lib/lib/Mode";

import { memoize } from "metabase-lib/lib/utils";

// TODO: remove these dependencies
import * as Card_DEPRECATED from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";
import { syncTableColumnsToQuery } from "metabase/lib/dataset";
import { getParametersWithExtras, isTransientId } from "metabase/meta/Card";
import {
  summarize,
  pivot,
  filter,
  breakout,
  distribution,
  toUnderlyingRecords,
  drillUnderlyingRecords,
} from "metabase/modes/lib/actions";
import { MetabaseApi, CardApi } from "metabase/services";
import Questions from "metabase/entities/questions";

import type {
  Parameter as ParameterObject,
  ParameterValues,
} from "metabase/meta/types/Parameter";
import type {
  DatasetQuery,
  Card as CardObject,
  VisualizationSettings,
} from "metabase/meta/types/Card";
import type { Dataset } from "metabase/meta/types/Dataset";
import type { TableId } from "metabase/meta/types/Table";
import type { DatabaseId } from "metabase/meta/types/Database";
import type { ClickObject } from "metabase/meta/types/Visualization";

import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "metabase-lib/lib/Alert";

type QuestionUpdateFn = (q: Question) => ?Promise<void>;

/**
 * This is a wrapper around a question/card object, which may contain one or more Query objects
 */
export default class Question {
  /**
   * The Question wrapper requires a metadata object because the queries it contains (like {@link StructuredQuery))
   * need metadata for accessing databases, tables and metrics.
   */
  _metadata: Metadata;

  /**
   * The plain object presentation of this question, equal to the format that Metabase REST API understands.
   * It is called `card` for both historical reasons and to make a clear distinction to this class.
   */
  _card: CardObject;

  /**
   * Parameter values mean either the current values of dashboard filters or SQL editor template parameters.
   * They are in the grey area between UI state and question state, but having them in Question wrapper is convenient.
   */
  _parameterValues: ParameterValues;

  /**
   * Bound update function, if any
   */
  _update: ?QuestionUpdateFn;

  /**
   * Question constructor
   */
  constructor(
    metadata: Metadata,
    card: CardObject,
    parameterValues?: ParameterValues,
    update?: ?QuestionUpdateFn,
  ) {
    this._metadata = metadata;
    this._card = card;
    this._parameterValues = parameterValues || {};
    this._update = update;
  }

  clone() {
    return new Question(
      this._metadata,
      this._card,
      this._parameterValues,
      this._update,
    );
  }

  /**
   * TODO Atte Keinänen 6/13/17: Discussed with Tom that we could use the default Question constructor instead,
   * but it would require changing the constructor signature so that `card` is an optional parameter and has a default value
   */
  static create({
    databaseId,
    tableId,
    metadata,
    parameterValues,
    type = "query",
    name,
    display = "table",
    visualization_settings = {},
    dataset_query = type === "native"
      ? NATIVE_QUERY_TEMPLATE
      : STRUCTURED_QUERY_TEMPLATE,
  }: {
    databaseId?: DatabaseId,
    tableId?: TableId,
    metadata: Metadata,
    parameterValues?: ParameterValues,
    type?: "query" | "native",
    name?: string,
    display?: string,
    visualization_settings?: VisualizationSettings,
    dataset_query?: DatasetQuery,
  } = {}) {
    // $FlowFixMe
    let card: Card = {
      name,
      display,
      visualization_settings,
      dataset_query,
    };
    if (tableId != null) {
      card = assocIn(card, ["dataset_query", "query", "source-table"], tableId);
    }
    if (databaseId != null) {
      card = assocIn(card, ["dataset_query", "database"], databaseId);
    }

    return new Question(metadata, card, parameterValues);
  }

  metadata(): Metadata {
    return this._metadata;
  }

  card() {
    return this._card;
  }
  setCard(card: CardObject): Question {
    const q = this.clone();
    q._card = card;
    return q;
  }

  /**
   * calls the passed in update function (useful for chaining) or bound update function with the question
   * NOTE: this passes Question instead of card, unlike how Query passes dataset_query
   */
  update(update?: QuestionUpdateFn, ...args: any[]) {
    // TODO: if update returns a new card, create a new Question based on that and return it
    if (update) {
      update(this, ...args);
    } else if (this._update) {
      this._update(this, ...args);
    } else {
      throw new Error("Question update function not provided or bound");
    }
  }

  bindUpdate(update: QuestionUpdateFn) {
    const q = this.clone();
    q._update = update;
    return q;
  }

  withoutNameAndId() {
    return this.setCard(
      chain(this.card())
        .dissoc("id")
        .dissoc("name")
        .dissoc("description")
        .value(),
    );
  }

  /**
   * A question contains either a:
   * - StructuredQuery for queries written in MBQL
   * - NativeQuery for queries written in data source's native query language
   *
   * This is just a wrapper object, the data is stored in `this._card.dataset_query` in a format specific to the query type.
   */
  @memoize
  query(): Query {
    const datasetQuery = this._card.dataset_query;

    for (const QueryClass of [StructuredQuery, NativeQuery]) {
      if (QueryClass.isDatasetQueryType(datasetQuery)) {
        return new QueryClass(this, datasetQuery);
      }
    }

    throw new Error("Unknown query type: " + datasetQuery.type);
  }

  isNative(): boolean {
    return this.query() instanceof NativeQuery;
  }

  isStructured(): boolean {
    return this.query() instanceof StructuredQuery;
  }

  /**
   * Returns a new Question object with an updated query.
   * The query is saved to the `dataset_query` field of the Card object.
   */
  setQuery(newQuery: Query): Question {
    if (this._card.dataset_query !== newQuery.datasetQuery()) {
      return this.setCard(
        assoc(this.card(), "dataset_query", newQuery.datasetQuery()),
      );
    }
    return this;
  }

  datasetQuery(): DatasetQuery {
    return this.card().dataset_query;
  }

  setDatasetQuery(newDatasetQuery: DatasetQuery): Question {
    return this.setCard(assoc(this.card(), "dataset_query", newDatasetQuery));
  }

  /**
   * Returns a list of atomic queries (NativeQuery or StructuredQuery) contained in this question
   */
  atomicQueries(): AtomicQuery[] {
    const query = this.query();
    if (query instanceof AtomicQuery) {
      return [query];
    }
    return [];
  }

  /**
   * The visualization type of the question
   */
  display(): string {
    return this._card && this._card.display;
  }
  setDisplay(display) {
    return this.setCard(assoc(this.card(), "display", display));
  }

  setDefaultDisplay(): Question {
    const query = this.query();
    if (query instanceof StructuredQuery) {
      // TODO: move to StructuredQuery?
      const aggregations = query.aggregations();
      const breakouts = query.breakouts();
      const breakoutDimensions = breakouts.map(b => b.dimension());
      const breakoutFields = breakoutDimensions.map(d => d.field());
      if (aggregations.length === 0 && breakouts.length === 0) {
        return this.setDisplay("table");
      }
      if (aggregations.length === 1 && breakouts.length === 0) {
        return this.setDisplay("scalar");
      }
      if (aggregations.length === 1 && breakouts.length === 1) {
        if (breakoutFields[0].isState()) {
          return this.setDisplay("map").updateSettings({
            "map.type": "region",
            "map.region": "us_states",
          });
        } else if (breakoutFields[0].isCountry()) {
          return this.setDisplay("map").updateSettings({
            "map.type": "region",
            "map.region": "world_countries",
          });
        }
      }
      if (aggregations.length >= 1 && breakouts.length === 1) {
        if (breakoutFields[0].isDate()) {
          if (
            breakoutDimensions[0] instanceof DatetimeFieldDimension &&
            breakoutDimensions[0].isExtraction()
          ) {
            return this.setDisplay("bar");
          } else {
            return this.setDisplay("line");
          }
        }
        if (breakoutDimensions[0] instanceof BinnedDimension) {
          return this.setDisplay("bar");
        }
        if (breakoutFields[0].isCategory()) {
          return this.setDisplay("bar");
        }
      }
      if (aggregations.length === 1 && breakouts.length === 2) {
        if (_.any(breakoutFields, f => f.isDate())) {
          return this.setDisplay("line");
        }
        if (
          breakoutFields[0].isCoordinate() &&
          breakoutFields[1].isCoordinate()
        ) {
          return this.setDisplay("map").updateSettings({
            "map.type": "grid",
          });
        }
        if (_.all(breakoutFields, f => f.isCategory())) {
          return this.setDisplay("bar");
        }
      }
    }
    return this.setDisplay("table");
  }

  setDefaultQuery() {
    return this.query()
      .setDefaultQuery()
      .question();
  }

  settings(): VisualizationSettings {
    return (this._card && this._card.visualization_settings) || {};
  }
  setting(settingName, defaultValue = undefined) {
    const value = this.settings()[settingName];
    return value === undefined ? defaultValue : value;
  }
  setSettings(settings: VisualizationSettings) {
    return this.setCard(assoc(this.card(), "visualization_settings", settings));
  }
  updateSettings(settings: VisualizationSettings) {
    return this.setSettings({ ...this.settings(), ...settings });
  }

  type(): string {
    return this.datasetQuery().type;
  }

  isEmpty(): boolean {
    return this.query().isEmpty();
  }
  /**
   * Question is valid (as far as we know) and can be executed
   */
  canRun(): boolean {
    return this.query().canRun();
  }

  canWrite(): boolean {
    return this._card && this._card.can_write;
  }

  canAutoRun(): boolean {
    const db = this.database();
    return (db && db.auto_run_queries) || false;
  }

  /**
   * Returns the type of alert that current question supports
   *
   * The `visualization_settings` in card object doesn't contain default settings,
   * so you can provide the complete visualization settings object to `alertType`
   * for taking those into account
   */
  alertType(visualizationSettings) {
    const display = this.display();

    if (!this.canRun()) {
      return null;
    }

    const isLineAreaBar =
      display === "line" || display === "area" || display === "bar";

    if (display === "progress") {
      return ALERT_TYPE_PROGRESS_BAR_GOAL;
    } else if (isLineAreaBar) {
      const vizSettings = visualizationSettings
        ? visualizationSettings
        : this.card().visualization_settings;

      const goalEnabled = vizSettings["graph.show_goal"];
      const hasSingleYAxisColumn =
        vizSettings["graph.metrics"] &&
        vizSettings["graph.metrics"].length === 1;

      // We don't currently support goal alerts for multiseries question
      if (goalEnabled && hasSingleYAxisColumn) {
        return ALERT_TYPE_TIMESERIES_GOAL;
      } else {
        return ALERT_TYPE_ROWS;
      }
    } else {
      return ALERT_TYPE_ROWS;
    }
  }

  /**
   * Visualization drill-through and action widget actions
   *
   * Although most of these are essentially a way to modify the current query, having them as a part
   * of Question interface instead of Query interface makes it more convenient to also change the current visualization
   */
  summarize(aggregation) {
    const tableMetadata = this.tableMetadata();
    return this.setCard(summarize(this.card(), aggregation, tableMetadata));
  }
  breakout(b) {
    return this.setCard(breakout(this.card(), b));
  }
  pivot(breakouts = [], dimensions = []) {
    const tableMetadata = this.tableMetadata();
    return this.setCard(
      // $FlowFixMe: tableMetadata could be null
      pivot(this.card(), tableMetadata, breakouts, dimensions),
    );
  }
  filter(operator, column, value) {
    return this.setCard(filter(this.card(), operator, column, value));
  }
  drillUnderlyingRecords(dimensions) {
    return this.setCard(drillUnderlyingRecords(this.card(), dimensions));
  }
  toUnderlyingRecords(): ?Question {
    const newCard = toUnderlyingRecords(this.card());
    if (newCard) {
      return this.setCard(newCard);
    }
  }
  toUnderlyingData(): Question {
    return this.setDisplay("table");
  }
  distribution(column) {
    return this.setCard(distribution(this.card(), column));
  }

  composeThisQuery(): ?Question {
    const SAVED_QUESTIONS_FAUX_DATABASE = -1337;

    if (this.id()) {
      const card = {
        display: "table",
        dataset_query: {
          type: "query",
          database: SAVED_QUESTIONS_FAUX_DATABASE,
          query: {
            "source-table": "card__" + this.id(),
          },
        },
      };
      return this.setCard(card);
    }
  }

  drillPK(field: Field, value: Value): ?Question {
    const query = this.query();
    if (query instanceof StructuredQuery) {
      return query
        .reset()
        .setTable(field.table)
        .addFilter(["=", ["field-id", field.id], value])
        .question();
    }
  }

  syncColumnsAndSettings(previous) {
    const query = this.query();
    const previousQuery = previous && previous.query();
    if (
      query instanceof StructuredQuery &&
      previousQuery instanceof StructuredQuery
    ) {
      if (
        !_.isEqual(
          previous.setting("table.columns"),
          this.setting("table.columns"),
        )
      ) {
        return syncTableColumnsToQuery(this);
      }

      const addedColumnNames = _.difference(
        query.columnNames(),
        previousQuery.columnNames(),
      );
      const removedColumnNames = _.difference(
        previousQuery.columnNames(),
        query.columnNames(),
      );

      if (
        this.setting("graph.metrics") &&
        addedColumnNames.length > 0 &&
        removedColumnNames.length === 0
      ) {
        const addedMetricColumnNames = addedColumnNames.filter(
          name =>
            query.columnDimensionWithName(name) instanceof AggregationDimension,
        );
        if (addedMetricColumnNames.length > 0) {
          return this.updateSettings({
            "graph.metrics": [
              ...this.setting("graph.metrics"),
              ...addedMetricColumnNames,
            ],
          });
        }
      }

      if (
        this.setting("table.columns") &&
        addedColumnNames.length > 0 &&
        removedColumnNames.length === 0
      ) {
        return this.updateSettings({
          "table.columns": [
            ...this.setting("table.columns"),
            ...addedColumnNames.map(name => {
              const dimension = query.columnDimensionWithName(name);
              return {
                name: name,
                field_ref: dimension.baseDimension().mbql(),
                enabled: true,
              };
            }),
          ],
        });
      }
    }
    return this;
  }

  /**
   * returns the "top-level" {Question} for a nested structured query, e.x. with post-aggregation filters removed
   */
  topLevelQuestion(): Question {
    const query = this.query();
    if (query instanceof StructuredQuery && query !== query.topLevelQuery()) {
      return this.setQuery(query.topLevelQuery());
    } else {
      return this;
    }
  }

  /**
   * returns the {ClickObject} with all columns transformed to be relative to the "top-level" query
   */
  topLevelClicked(clicked: ClickObject): ClickObject {
    const query = this.query();
    if (query instanceof StructuredQuery && query !== query.topLevelQuery()) {
      return {
        ...clicked,
        column: clicked.column && query.topLevelColumn(clicked.column),
        dimensions:
          clicked.dimensions &&
          clicked.dimensions.map(dimension => ({
            ...dimension,
            column: dimension.column && query.topLevelColumn(dimension.column),
          })),
      };
    } else {
      return clicked;
    }
  }

  // deprecated
  tableMetadata(): ?Table {
    const query = this.query();
    if (query instanceof StructuredQuery) {
      return query.table();
    } else {
      return null;
    }
  }

  @memoize
  mode(): ?Mode {
    return Mode.forQuestion(this);
  }

  isObjectDetail(): boolean {
    const mode = this.mode();
    return mode ? mode.name() === "object" : false;
  }

  objectDetailPK(): any {
    const query = this.query();
    if (this.isObjectDetail() && query instanceof StructuredQuery) {
      const filters = query.filters();
      return filters[0] && filters[0][2];
    }
  }

  /**
   * A user-defined name for the question
   */
  displayName(): ?string {
    return this._card && this._card.name;
  }

  setDisplayName(name: String) {
    return this.setCard(assoc(this.card(), "name", name));
  }

  collectionId(): ?number {
    return this._card && this._card.collection_id;
  }
  setCollectionId(collectionId: number) {
    return this.setCard(assoc(this.card(), "collection_id", collectionId));
  }

  id(): number {
    return this._card && this._card.id;
  }

  description(): ?string {
    return this._card && this._card.description;
  }

  isSaved(): boolean {
    return !!this.id();
  }

  publicUUID(): string {
    return this._card && this._card.public_uuid;
  }

  database(): ?Database {
    const query = this.query();
    return query && typeof query.database === "function"
      ? query.database()
      : null;
  }
  databaseId(): ?DatabaseId {
    const db = this.database();
    return db ? db.id : null;
  }
  table(): ?Table {
    const query = this.query();
    return query && typeof query.table === "function" ? query.table() : null;
  }
  tableId(): ?TableId {
    const table = this.table();
    return table ? table.id : null;
  }

  getUrl({
    originalQuestion,
    clean = true,
  }: { originalQuestion?: Question, clean?: boolean } = {}): string {
    if (
      !this.id() ||
      (originalQuestion && this.isDirtyComparedTo(originalQuestion))
    ) {
      return Urls.question(null, this._serializeForUrl({ clean }));
    } else {
      return Urls.question(this.id(), "");
    }
  }

  getAutomaticDashboardUrl(filters /*?: Filter[] = []*/) {
    let cellQuery = "";
    if (filters.length > 0) {
      const mbqlFilter = filters.length > 1 ? ["and", ...filters] : filters[0];
      cellQuery = `/cell/${Card_DEPRECATED.utf8_to_b64url(
        JSON.stringify(mbqlFilter),
      )}`;
    }
    const questionId = this.id();
    if (questionId != null && !isTransientId(questionId)) {
      return `/auto/dashboard/question/${questionId}${cellQuery}`;
    } else {
      const adHocQuery = Card_DEPRECATED.utf8_to_b64url(
        JSON.stringify(this.card().dataset_query),
      );
      return `/auto/dashboard/adhoc/${adHocQuery}${cellQuery}`;
    }
  }

  getComparisonDashboardUrl(filters /*?: Filter[] = []*/) {
    let cellQuery = "";
    if (filters.length > 0) {
      const mbqlFilter = filters.length > 1 ? ["and", ...filters] : filters[0];
      cellQuery = `/cell/${Card_DEPRECATED.utf8_to_b64url(
        JSON.stringify(mbqlFilter),
      )}`;
    }
    const questionId = this.id();
    const query = this.query();
    if (query instanceof StructuredQuery) {
      const tableId = query.tableId();
      if (tableId) {
        if (questionId != null && !isTransientId(questionId)) {
          return `/auto/dashboard/question/${questionId}${cellQuery}/compare/table/${tableId}`;
        } else {
          const adHocQuery = Card_DEPRECATED.utf8_to_b64url(
            JSON.stringify(this.card().dataset_query),
          );
          return `/auto/dashboard/adhoc/${adHocQuery}${cellQuery}/compare/table/${tableId}`;
        }
      }
    }
  }

  setResultsMetadata(resultsMetadata) {
    const metadataColumns = resultsMetadata && resultsMetadata.columns;
    const metadataChecksum = resultsMetadata && resultsMetadata.checksum;

    return this.setCard({
      ...this.card(),
      result_metadata: metadataColumns,
      metadata_checksum: metadataChecksum,
    });
  }

  /**
   * Returns true if the questions are equivalent (including id, card, and parameters)
   */
  isEqual(other) {
    if (!other) {
      return false;
    } else if (this.id() != other.id()) {
      return false;
    } else if (!_.isEqual(this.card(), other.card())) {
      return false;
    } else if (!_.isEqual(this.parameters(), other.parameters())) {
      return false;
    }
    return true;
  }

  /**
   * Runs the query and returns an array containing results for each single query.
   *
   * If we have a saved and clean single-query question, we use `CardApi.query` instead of a ad-hoc dataset query.
   * This way we benefit from caching and query optimizations done by Metabase backend.
   */
  async apiGetResults({
    cancelDeferred,
    isDirty = false,
    ignoreCache = false,
  } = {}): Promise<[Dataset]> {
    // TODO Atte Keinänen 7/5/17: Should we clean this query with Query.cleanQuery(query) before executing it?

    const canUseCardApiEndpoint = !isDirty && this.isSaved();

    const parameters = this.parametersList()
      // include only parameters that have a value applied
      .filter(param => _.has(param, "value"))
      // only the superset of parameters object that API expects
      .map(param => _.pick(param, "type", "target", "value"));

    if (canUseCardApiEndpoint) {
      const queryParams = {
        cardId: this.id(),
        ignore_cache: ignoreCache,
        parameters,
      };

      return [
        await CardApi.query(queryParams, {
          cancelled: cancelDeferred.promise,
        }),
      ];
    } else {
      const getDatasetQueryResult = datasetQuery => {
        const datasetQueryWithParameters = {
          ...datasetQuery,
          parameters,
        };

        return MetabaseApi.dataset(
          datasetQueryWithParameters,
          cancelDeferred ? { cancelled: cancelDeferred.promise } : {},
        );
      };

      const datasetQueries = this.atomicQueries().map(query =>
        query.datasetQuery(),
      );
      return Promise.all(datasetQueries.map(getDatasetQueryResult));
    }
  }

  // NOTE: prefer `reduxCreate` so the store is automatically updated
  async apiCreate() {
    const createdCard = await Questions.api.create(this.card());
    return this.setCard(createdCard);
  }

  // NOTE: prefer `reduxUpdate` so the store is automatically updated
  async apiUpdate() {
    const updatedCard = await Questions.api.update(this.card());
    return this.setCard(updatedCard);
  }

  async reduxCreate(dispatch) {
    const action = await dispatch(Questions.actions.create(this.card()));
    return this.setCard(Questions.HACK_getObjectFromAction(action));
  }

  async reduxUpdate(dispatch) {
    const action = await dispatch(
      Questions.actions.update({ id: this.id() }, this.card()),
    );
    return this.setCard(Questions.HACK_getObjectFromAction(action));
  }

  // TODO: Fix incorrect Flow signature
  parameters(): ParameterObject[] {
    return getParametersWithExtras(this.card(), this._parameterValues);
  }

  parametersList(): ParameterObject[] {
    // $FlowFixMe
    return (Object.values(this.parameters()): ParameterObject[]);
  }

  // predicate function that dermines if the question is "dirty" compared to the given question
  isDirtyComparedTo(originalQuestion: Question) {
    if (!this.isSaved() && this.canRun()) {
      // if it's new, then it's dirty if it is runnable
      return true;
    } else {
      // if it's saved, then it's dirty when the current card doesn't match the last saved version
      const origCardSerialized =
        originalQuestion &&
        originalQuestion._serializeForUrl({
          includeOriginalCardId: false,
        });
      const currentCardSerialized = this._serializeForUrl({
        includeOriginalCardId: false,
      });
      return currentCardSerialized !== origCardSerialized;
    }
  }

  // Internal methods
  _serializeForUrl({ includeOriginalCardId = true, clean = true } = {}) {
    const query = clean ? this.query().clean() : this.query();

    const cardCopy = {
      name: this._card.name,
      description: this._card.description,
      dataset_query: query.datasetQuery(),
      display: this._card.display,
      parameters: this._card.parameters,
      visualization_settings: this._card.visualization_settings,
      ...(includeOriginalCardId
        ? { original_card_id: this._card.original_card_id }
        : {}),
    };

    return Card_DEPRECATED.utf8_to_b64url(JSON.stringify(cardCopy));
  }
}

window.Question = Question;
window.NativeQuery = NativeQuery;
window.StructuredQuery = StructuredQuery;
