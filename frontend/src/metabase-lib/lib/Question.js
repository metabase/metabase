import _ from "underscore";
import { chain, assoc, dissoc, assocIn, getIn } from "icepick";

// NOTE: the order of these matters due to circular dependency issues
import StructuredQuery, {
  STRUCTURED_QUERY_TEMPLATE,
} from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery, {
  NATIVE_QUERY_TEMPLATE,
} from "metabase-lib/lib/queries/NativeQuery";
import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";
import InternalQuery from "./queries/InternalQuery";

import Query from "metabase-lib/lib/queries/Query";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";

import {
  AggregationDimension,
  FieldDimension,
} from "metabase-lib/lib/Dimension";
import Mode from "metabase-lib/lib/Mode";
import { isStandard } from "metabase/lib/query/filter";

import { memoize, sortObject } from "metabase-lib/lib/utils";

// TODO: remove these dependencies
import * as Card_DEPRECATED from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";
import {
  findColumnSettingIndexForColumn,
  findColumnIndexForColumnSetting,
  syncTableColumnsToQuery,
} from "metabase/lib/dataset";
import { getParametersWithExtras, isTransientId } from "metabase/meta/Card";
import {
  parameterToMBQLFilter,
  normalizeParameterValue,
} from "metabase/meta/Parameter";
import {
  aggregate,
  breakout,
  filter,
  pivot,
  distribution,
  toUnderlyingRecords,
  drillUnderlyingRecords,
} from "metabase/modes/lib/actions";
import { MetabaseApi, CardApi, maybeUsePivotEndpoint } from "metabase/services";
import Questions from "metabase/entities/questions";

import type {
  Parameter as ParameterObject,
  ParameterValues,
} from "metabase-types/types/Parameter";
import type {
  DatasetQuery,
  Card as CardObject,
  VisualizationSettings,
} from "metabase-types/types/Card";
import type { Dataset, Value } from "metabase-types/types/Dataset";
import type { TableId } from "metabase-types/types/Table";
import type { DatabaseId } from "metabase-types/types/Database";
import type { ClickObject } from "metabase-types/types/Visualization";

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
   * The plain object presentation of this question, equal to the format that Metabase REST API understands.
   * It is called `card` for both historical reasons and to make a clear distinction to this class.
   */
  _card: CardObject;

  /**
   * The Question wrapper requires a metadata object because the queries it contains (like {@link StructuredQuery})
   * need metadata for accessing databases, tables and metrics.
   */
  _metadata: Metadata;

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
    card: CardObject,
    metadata?: Metadata,
    parameterValues?: ParameterValues,
    update?: ?QuestionUpdateFn,
  ) {
    this._card = card;
    this._metadata =
      metadata ||
      new Metadata({
        databases: {},
        tables: {},
        fields: {},
        metrics: {},
        segments: {},
      });
    this._parameterValues = parameterValues || {};
    this._update = update;
  }

  clone() {
    return new Question(
      this._card,
      this._metadata,
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
    let card: CardObject = {
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

    return new Question(card, metadata, parameterValues);
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

    for (const QueryClass of [StructuredQuery, NativeQuery, InternalQuery]) {
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

  // locking the display prevents auto-selection
  lockDisplay(): Question {
    return this.setDisplayIsLocked(true);
  }
  setDisplayIsLocked(locked: boolean): Question {
    return this.setCard(assoc(this.card(), "displayIsLocked", locked));
  }
  displayIsLocked(): boolean {
    return this._card && this._card.displayIsLocked;
  }

  // If we're locked to a display that is no longer "sensible", unlock it.
  maybeUnlockDisplay(sensibleDisplays): Question {
    const locked =
      this.displayIsLocked() && sensibleDisplays.includes(this.display());
    return this.setDisplayIsLocked(locked);
  }

  // Switches display based on data shape. For 1x1 data, we show a scalar. If
  // our display was a 1x1 type, but the data isn't 1x1, we show a table.
  switchTableScalar({ rows = [], cols }): Question {
    if (this.displayIsLocked()) {
      return this;
    }
    const display = this.display();
    const isScalar = ["scalar", "progress", "gauge"].includes(display);
    const isOneByOne = rows.length === 1 && cols.length === 1;

    const newDisplay =
      !isScalar && isOneByOne
        ? // if we have a 1x1 data result then this should always be viewed as a scalar
          "scalar"
        : isScalar && !isOneByOne
        ? // any time we were a scalar and now have more than 1x1 data switch to table view
          "table"
        : // otherwise leave the display unchanged
          display;

    return this.setDisplay(newDisplay);
  }

  setDefaultDisplay(): Question {
    if (this.displayIsLocked()) {
      return this;
    }
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
            breakoutDimensions[0] instanceof FieldDimension &&
            breakoutDimensions[0].temporalUnit() &&
            breakoutDimensions[0].isTemporalExtraction()
          ) {
            return this.setDisplay("bar");
          } else {
            return this.setDisplay("line");
          }
        }
        if (
          breakoutDimensions[0] instanceof FieldDimension &&
          breakoutDimensions[0].binningStrategy()
        ) {
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
  aggregate(a): Question {
    return aggregate(this, a) || this;
  }
  breakout(b): ?Question {
    return breakout(this, b) || this;
  }
  filter(operator, column, value): Question {
    return filter(this, operator, column, value) || this;
  }
  pivot(breakouts = [], dimensions = []): Question {
    return pivot(this, breakouts, dimensions) || this;
  }
  drillUnderlyingRecords(dimensions): Question {
    return drillUnderlyingRecords(this, dimensions) || this;
  }
  toUnderlyingRecords(): Question {
    return toUnderlyingRecords(this) || this;
  }
  toUnderlyingData(): Question {
    return this.setDisplay("table");
  }
  distribution(column): Question {
    return distribution(this, column) || this;
  }

  composeThisQuery(): ?Question {
    if (this.id()) {
      const card = {
        display: "table",
        dataset_query: {
          type: "query",
          database: this.databaseId(),
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
        .filter(["=", ["field", field.id, null], value])
        .question();
    }
  }

  _syncStructuredQueryColumnsAndSettings(previousQuestion, previousQuery) {
    const query = this.query();

    if (
      !_.isEqual(
        previousQuestion.setting("table.columns"),
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

    return this;
  }

  _syncNativeQuerySettings({ data: { cols = [] } = {} }) {
    const vizSettings = this.setting("table.columns") || [];
    // "table.columns" receive a value only if there are custom settings
    // e.g. some columns are hidden. If it's empty, it means everything is visible
    const isUsingDefaultSettings = vizSettings.length === 0;
    if (isUsingDefaultSettings) {
      return this;
    }

    let addedColumns = cols.filter(col => {
      const hasVizSettings =
        findColumnSettingIndexForColumn(vizSettings, col) >= 0;
      return !hasVizSettings;
    });

    const validVizSettings = vizSettings.filter(colSetting => {
      const hasColumn = findColumnIndexForColumnSetting(cols, colSetting) >= 0;
      return hasColumn;
    });
    const noColumnsRemoved = validVizSettings.length === vizSettings.length;

    if (noColumnsRemoved && addedColumns.length === 0) {
      return this;
    }

    addedColumns = addedColumns.map(col => ({
      name: col.name,
      fieldRef: col.field_ref,
      enabled: true,
    }));

    return this.updateSettings({
      "table.columns": [...validVizSettings, ...addedColumns],
    });
  }

  syncColumnsAndSettings(previous, queryResults) {
    const query = this.query();
    const isQueryResultValid = queryResults && !queryResults.error;
    if (query instanceof NativeQuery && isQueryResultValid) {
      return this._syncNativeQuerySettings(queryResults);
    }
    const previousQuery = previous && previous.query();
    if (
      query instanceof StructuredQuery &&
      previousQuery instanceof StructuredQuery
    ) {
      return this._syncStructuredQueryColumnsAndSettings(
        previous,
        previousQuery,
      );
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
      if (filters[0] && isStandard(filters[0])) {
        return filters[0][2];
      }
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

  markDirty(): Question {
    return this.setCard(
      dissoc(assoc(this.card(), "original_card_id", this.id()), "id"),
    );
  }

  description(): ?string {
    return this._card && this._card.description;
  }

  lastEditInfo() {
    return this._card && this._card["last-edit-info"];
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
    query,
  }: {
    originalQuestion?: Question,
    clean?: boolean,
    query?: { [string]: any },
  } = {}): string {
    if (
      !this.id() ||
      (originalQuestion && this.isDirtyComparedTo(originalQuestion))
    ) {
      return Urls.question(null, this._serializeForUrl({ clean }), query);
    } else {
      return Urls.question(this.card(), "", query);
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
    } else if (this.id() !== other.id()) {
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
      .map(param => _.pick(param, "type", "target", "value"))
      .map(({ type, value, target }) => {
        return {
          type,
          value: normalizeParameterValue(type, value),
          target,
        };
      });

    if (canUseCardApiEndpoint) {
      const queryParams = {
        cardId: this.id(),
        ignore_cache: ignoreCache,
        parameters,
      };

      return [
        await maybeUsePivotEndpoint(
          CardApi.query,
          this.card(),
          this.metadata(),
        )(queryParams, {
          cancelled: cancelDeferred.promise,
        }),
      ];
    } else {
      const getDatasetQueryResult = datasetQuery => {
        const datasetQueryWithParameters = {
          ...datasetQuery,
          parameters,
        };

        return maybeUsePivotEndpoint(
          MetabaseApi.dataset,
          this.card(),
          this.metadata(),
        )(
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

  setParameters(parameters) {
    return this.setCard(assoc(this.card(), "parameters", parameters));
  }

  // TODO: Fix incorrect Flow signature
  parameters(): ParameterObject[] {
    return getParametersWithExtras(this.card(), this._parameterValues);
  }

  parametersList(): ParameterObject[] {
    return (Object.values(this.parameters()): ParameterObject[]);
  }

  // predicate function that dermines if the question is "dirty" compared to the given question
  isDirtyComparedTo(originalQuestion: Question) {
    if (!this.isSaved() && this.canRun() && originalQuestion == null) {
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

  isDirtyComparedToWithoutParameters(originalQuestion: Question) {
    const [a, b] = [this, originalQuestion].map(q => {
      return q && new Question(q.card(), this.metadata()).setParameters([]);
    });
    return a.isDirtyComparedTo(b);
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
      ...(_.isEmpty(this._parameterValues)
        ? undefined
        : { parameterValues: this._parameterValues }), // this is kinda wrong. these values aren't really part of the card, but this is a convenient place to put them
      visualization_settings: this._card.visualization_settings,
      ...(includeOriginalCardId
        ? { original_card_id: this._card.original_card_id }
        : {}),
    };

    return Card_DEPRECATED.utf8_to_b64url(JSON.stringify(sortObject(cardCopy)));
  }

  convertParametersToFilters() {
    if (!this.isStructured()) {
      return this;
    }
    return this.parametersList()
      .reduce(
        (query, parameter) =>
          query.filter(parameterToMBQLFilter(parameter, this.metadata())),
        this.query(),
      )
      .question()
      .setParameters([]);
  }

  getUrlWithParameters() {
    const question = this.query().isEditable()
      ? this.convertParametersToFilters()
      : this.markDirty(); // forces use of serialized question url
    const query = this.isNative() ? this._parameterValues : undefined;
    return question.getUrl({ originalQuestion: this, query });
  }

  getModerationReviews() {
    return getIn(this, ["_card", "moderation_reviews"]) || [];
  }
  getLatestModerationReview() {
    return _.findWhere(this.getModerationReviews(), { most_recent: true });
  }
}

window.Question = Question;
window.NativeQuery = NativeQuery;
window.StructuredQuery = StructuredQuery;
