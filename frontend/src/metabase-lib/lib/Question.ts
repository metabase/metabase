// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { assoc, assocIn, chain, dissoc, getIn } from "icepick";
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
import { isFK } from "metabase/lib/schema_metadata";
import { memoize, sortObject } from "metabase-lib/lib/utils";
// TODO: remove these dependencies
import * as Urls from "metabase/lib/urls";
import {
  findColumnIndexForColumnSetting,
  findColumnSettingIndexForColumn,
  syncTableColumnsToQuery,
} from "metabase/lib/dataset";
import { isTransientId } from "metabase/meta/Card";
import {
  getValueAndFieldIdPopulatedParametersFromCard,
  remapParameterValuesToTemplateTags,
} from "metabase/parameters/utils/cards";
import { parameterToMBQLFilter } from "metabase/parameters/utils/mbql";
import {
  normalizeParameterValue,
  getParameterValuesBySlug,
} from "metabase/parameters/utils/parameter-values";
import {
  aggregate,
  breakout,
  distribution,
  drillUnderlyingRecords,
  filter,
  pivot,
  toUnderlyingRecords,
} from "metabase/modes/lib/actions";
import {
  DashboardApi,
  CardApi,
  maybeUsePivotEndpoint,
  MetabaseApi,
} from "metabase/services";
import Questions from "metabase/entities/questions";
import {
  Parameter as ParameterObject,
  ParameterValues,
} from "metabase-types/types/Parameter";
import {
  Card as CardObject,
  DatasetQuery,
  VisualizationSettings,
} from "metabase-types/types/Card";
import { Dataset, Value } from "metabase-types/types/Dataset";
import { TableId } from "metabase-types/types/Table";
import { DatabaseId } from "metabase-types/types/Database";
import { ClickObject } from "metabase-types/types/Visualization";
import { DependentMetadataItem } from "metabase-types/types/Query";
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "metabase-lib/lib/Alert";
import { utf8_to_b64url } from "metabase/lib/encoding";

type QuestionUpdateFn = (q: Question) => Promise<void> | null | undefined;

export type QuestionCreatorOpts = {
  databaseId?: DatabaseId;
  tableId?: TableId;
  metadata?: Metadata;
  parameterValues?: ParameterValues;
  type?: "query" | "native";
  name?: string;
  display?: string;
  visualization_settings?: VisualizationSettings;
  dataset_query?: DatasetQuery;
};

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
  _update: QuestionUpdateFn | null | undefined;

  /**
   * Question constructor
   */
  constructor(
    card: CardObject,
    metadata?: Metadata,
    parameterValues?: ParameterValues,
    update?: QuestionUpdateFn | null | undefined,
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
    collectionId,
    metadata,
    parameterValues,
    type = "query",
    name,
    display = "table",
    visualization_settings = {},
    dataset_query = type === "native"
      ? NATIVE_QUERY_TEMPLATE
      : STRUCTURED_QUERY_TEMPLATE,
  }: QuestionCreatorOpts = {}) {
    let card: CardObject = {
      name,
      collection_id: collectionId,
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

  omitTransientCardIds() {
    let question = this;

    const card = question.card();
    const { id, original_card_id } = card;
    if (isTransientId(id)) {
      question = question.setCard(_.omit(question.card(), "id"));
    }
    if (isTransientId(original_card_id)) {
      question = question.setCard(_.omit(question.card(), "original_card_id"));
    }

    return question;
  }

  /**
   * A question contains either a:
   * - StructuredQuery for queries written in MBQL
   * - NativeQuery for queries written in data source's native query language
   *
   * This is just a wrapper object, the data is stored in `this._card.dataset_query` in a format specific to the query type.
   */
  @memoize
  query(): AtomicQuery {
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

  isDataset() {
    return this._card && this._card.dataset;
  }

  setDataset(dataset) {
    return this.setCard(assoc(this.card(), "dataset", dataset));
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

  // If we're locked to a display that is no longer "sensible", unlock it
  // unless it was locked in unsensible
  maybeUnlockDisplay(sensibleDisplays, previousSensibleDisplays): Question {
    const wasSensible =
      previousSensibleDisplays == null ||
      previousSensibleDisplays.includes(this.display());
    const isSensible = sensibleDisplays.includes(this.display());
    const shouldUnlock = wasSensible && !isSensible;
    const locked = this.displayIsLocked() && !shouldUnlock;
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
      !isScalar && isOneByOne // if we have a 1x1 data result then this should always be viewed as a scalar
        ? "scalar"
        : isScalar && !isOneByOne // any time we were a scalar and now have more than 1x1 data switch to table view
        ? "table" // otherwise leave the display unchanged
        : display;
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

  creationType(): string {
    return this.card().creationType;
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

  breakout(b): Question | null | undefined {
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

  composeThisQuery(): Question | null | undefined {
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

  composeDataset() {
    if (!this.isDataset()) {
      return this;
    }

    return this.setDatasetQuery({
      type: "query",
      database: this.databaseId(),
      query: {
        "source-table": "card__" + this.id(),
      },
    });
  }

  drillPK(field: Field, value: Value): Question | null | undefined {
    const query = this.query();

    if (!(query instanceof StructuredQuery)) {
      if (this.isDataset()) {
        const drillQuery = Question.create({
          type: "query",
          databaseId: this.databaseId(),
          tableId: field.table_id,
          metadata: this.metadata(),
        }).query();
        return drillQuery.addFilter(["=", field.reference(), value]).question();
      }
      return;
    }

    const otherPKFilters = query
      .filters()
      ?.filter(filter => {
        const filterField = filter?.field();

        if (!filterField) {
          return false;
        }

        const isNotSameField = filterField.id !== field.id;
        const isPKEqualsFilter =
          filterField.isPK() && filter.operatorName() === "=";
        const isFromSameTable = filterField.table.id === field.table.id;
        return isPKEqualsFilter && isNotSameField && isFromSameTable;
      })
      .map(filter => filter.raw());
    const filtersToApply = [
      ["=", ["field", field.id, null], value],
      ...otherPKFilters,
    ];
    const resultedQuery = filtersToApply.reduce((query, filter) => {
      return query.addFilter(filter);
    }, query.reset().setTable(field.table));
    return resultedQuery.question();
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
      const isMutatingColumn =
        findColumnIndexForColumnSetting(addedColumns, colSetting) >= 0;
      return hasColumn && !isMutatingColumn;
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
  mode(): Mode | null | undefined {
    return Mode.forQuestion(this);
  }

  /**
   * Returns true if, based on filters and table columns, the expected result is a single row.
   * However, it might not be true when a PK column is not unique, leading to multiple rows.
   * Because of that, always check query results in addition to this property.
   */
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
  displayName(): string | null | undefined {
    return this._card && this._card.name;
  }

  setDisplayName(name: string) {
    return this.setCard(assoc(this.card(), "name", name));
  }

  collectionId(): number | null | undefined {
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

  setDashboardProps({
    dashboardId,
    dashcardId,
  }:
    | { dashboardId: number; dashcardId: number }
    | { dashboardId: undefined; dashcardId: undefined }): Question {
    const card = chain(this.card())
      .assoc("dashboardId", dashboardId)
      .assoc("dashcardId", dashcardId)
      .value();

    return this.setCard(card);
  }

  description(): string | null | undefined {
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

  database(): Database | null | undefined {
    const query = this.query();
    return query && typeof query.database === "function"
      ? query.database()
      : null;
  }

  databaseId(): DatabaseId | null | undefined {
    const db = this.database();
    return db ? db.id : null;
  }

  table(): Table | null | undefined {
    const query = this.query();
    return query && typeof query.table === "function" ? query.table() : null;
  }

  tableId(): TableId | null | undefined {
    const table = this.table();
    return table ? table.id : null;
  }

  getUrl({
    originalQuestion,
    clean = true,
    query,
    includeDisplayIsLocked,
    creationType,
  }: {
    originalQuestion?: Question;
    clean?: boolean;
    query?: Record<string, any>;
    includeDisplayIsLocked?: boolean;
    creationType?: string;
  } = {}): string {
    const question = this.omitTransientCardIds();

    if (
      !question.id() ||
      (originalQuestion && question.isDirtyComparedTo(originalQuestion))
    ) {
      return Urls.question(null, {
        hash: question._serializeForUrl({
          clean,
          includeDisplayIsLocked,
          creationType,
        }),
        query,
      });
    } else {
      return Urls.question(question.card(), { query });
    }
  }

  getAutomaticDashboardUrl(
    filters,
    /*?: Filter[] = []*/
  ) {
    let cellQuery = "";

    if (filters.length > 0) {
      const mbqlFilter = filters.length > 1 ? ["and", ...filters] : filters[0];
      cellQuery = `/cell/${utf8_to_b64url(JSON.stringify(mbqlFilter))}`;
    }

    const questionId = this.id();

    if (questionId != null && !isTransientId(questionId)) {
      return `/auto/dashboard/question/${questionId}${cellQuery}`;
    } else {
      const adHocQuery = utf8_to_b64url(
        JSON.stringify(this.card().dataset_query),
      );
      return `/auto/dashboard/adhoc/${adHocQuery}${cellQuery}`;
    }
  }

  getComparisonDashboardUrl(
    filters,
    /*?: Filter[] = []*/
  ) {
    let cellQuery = "";

    if (filters.length > 0) {
      const mbqlFilter = filters.length > 1 ? ["and", ...filters] : filters[0];
      cellQuery = `/cell/${utf8_to_b64url(JSON.stringify(mbqlFilter))}`;
    }

    const questionId = this.id();
    const query = this.query();

    if (query instanceof StructuredQuery) {
      const tableId = query.tableId();

      if (tableId) {
        if (questionId != null && !isTransientId(questionId)) {
          return `/auto/dashboard/question/${questionId}${cellQuery}/compare/table/${tableId}`;
        } else {
          const adHocQuery = utf8_to_b64url(
            JSON.stringify(this.card().dataset_query),
          );
          return `/auto/dashboard/adhoc/${adHocQuery}${cellQuery}/compare/table/${tableId}`;
        }
      }
    }
  }

  setResultsMetadata(resultsMetadata) {
    const metadataColumns = resultsMetadata && resultsMetadata.columns;
    return this.setCard({
      ...this.card(),
      result_metadata: metadataColumns,
    });
  }

  getResultMetadata() {
    return this.card().result_metadata ?? [];
  }

  dependentMetadata(): DependentMetadataItem[] {
    if (!this.isDataset()) {
      return [];
    }
    const dependencies = [];

    this.getResultMetadata().forEach(field => {
      if (isFK(field) && field.fk_target_field_id) {
        dependencies.push({
          type: "field",
          id: field.fk_target_field_id,
        });
      }
    });

    return dependencies;
  }

  /**
   * Returns true if the questions are equivalent (including id, card, and parameters)
   */
  isEqual(other, { compareResultsMetadata = true } = {}) {
    if (!other) {
      return false;
    }
    if (this.id() !== other.id()) {
      return false;
    }

    const card = this.card();
    const otherCard = other.card();
    const areCardsEqual = compareResultsMetadata
      ? _.isEqual(card, otherCard)
      : _.isEqual(
          _.omit(card, "result_metadata"),
          _.omit(otherCard, "result_metadata"),
        );

    if (!areCardsEqual) {
      return false;
    }

    if (!_.isEqual(this.parameters(), other.parameters())) {
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
    collectionPreview = false,
  } = {}): Promise<[Dataset]> {
    // TODO Atte Keinänen 7/5/17: Should we clean this query with Query.cleanQuery(query) before executing it?
    const canUseCardApiEndpoint = !isDirty && this.isSaved();
    const parameters = this.parameters()
      // include only parameters that have a value applied
      .filter(param => _.has(param, "value"))
      // only the superset of parameters object that API expects
      .map(param => _.pick(param, "type", "target", "value", "id"))
      .map(({ type, value, target, id }) => {
        return {
          type,
          value: normalizeParameterValue(type, value),
          target,
          id,
        };
      });

    if (canUseCardApiEndpoint) {
      const dashboardId = this._card.dashboardId;
      const dashcardId = this._card.dashcardId;

      const queryParams = {
        cardId: this.id(),
        dashboardId,
        dashcardId,
        ignore_cache: ignoreCache,
        collection_preview: collectionPreview,
        parameters,
      };
      return [
        await maybeUsePivotEndpoint(
          dashboardId ? DashboardApi.cardQuery : CardApi.query,
          this.card(),
          this.metadata(),
        )(queryParams, {
          cancelled: cancelDeferred.promise,
        }),
      ];
    } else {
      const getDatasetQueryResult = datasetQuery => {
        const datasetQueryWithParameters = { ...datasetQuery, parameters };
        return maybeUsePivotEndpoint(
          MetabaseApi.dataset,
          this.card(),
          this.metadata(),
        )(
          datasetQueryWithParameters,
          cancelDeferred
            ? {
                cancelled: cancelDeferred.promise,
              }
            : {},
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

  async reduxUpdate(dispatch, { excludeDatasetQuery = false } = {}) {
    const fullCard = this.card();
    const card = excludeDatasetQuery
      ? _.omit(fullCard, "dataset_query")
      : fullCard;
    const action = await dispatch(
      Questions.actions.update(
        {
          id: this.id(),
        },
        card,
      ),
    );
    return this.setCard(Questions.HACK_getObjectFromAction(action));
  }

  setParameters(parameters) {
    return this.setCard(assoc(this.card(), "parameters", parameters));
  }

  setParameterValues(parameterValues) {
    const question = this.clone();
    question._parameterValues = parameterValues;
    return question;
  }

  // TODO: Fix incorrect Flow signature
  parameters(): ParameterObject[] {
    return getValueAndFieldIdPopulatedParametersFromCard(
      this.card(),
      this.metadata(),
      this._parameterValues,
    );
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
      return (
        q &&
        new Question(q.card(), this.metadata())
          .setParameters([])
          .setDashboardProps({
            dashboardId: undefined,
            dashcardId: undefined,
          })
      );
    });
    return a.isDirtyComparedTo(b);
  }

  // Internal methods
  _serializeForUrl({
    includeOriginalCardId = true,
    clean = true,
    includeDisplayIsLocked = false,
    creationType,
  } = {}) {
    const query = clean ? this.query().clean() : this.query();
    const cardCopy = {
      name: this._card.name,
      description: this._card.description,
      collection_id: this._card.collection_id,
      dataset_query: query.datasetQuery(),
      display: this._card.display,
      parameters: this._card.parameters,
      ...(_.isEmpty(this._parameterValues)
        ? undefined
        : {
            parameterValues: this._parameterValues,
          }),
      // this is kinda wrong. these values aren't really part of the card, but this is a convenient place to put them
      visualization_settings: this._card.visualization_settings,
      ...(includeOriginalCardId
        ? {
            original_card_id: this._card.original_card_id,
          }
        : {}),
      ...(includeDisplayIsLocked
        ? {
            displayIsLocked: this._card.displayIsLocked,
          }
        : {}),

      ...(creationType ? { creationType } : {}),
      dashboardId: this._card.dashboardId,
      dashcardId: this._card.dashcardId,
    };
    return utf8_to_b64url(JSON.stringify(sortObject(cardCopy)));
  }

  convertParametersToFilters() {
    if (!this.isStructured()) {
      return this;
    }

    const [query, isAltered] = this.parameters().reduce(
      ([query, isAltered], parameter) => {
        const filter = parameterToMBQLFilter(parameter, this.metadata());
        return filter ? [query.filter(filter), true] : [query, isAltered];
      },
      [this.query(), false],
    );

    const question = query
      .question()
      .setParameters(undefined)
      .setParameterValues(undefined);

    return isAltered ? question.markDirty() : question;
  }

  getUrlWithParameters(parameters, parameterValues, { objectId, clean } = {}) {
    const includeDisplayIsLocked = true;

    if (this.isStructured()) {
      const questionWithParameters = this.setParameters(parameters);

      if (!this.query().readOnly()) {
        return questionWithParameters
          .setParameterValues(parameterValues)
          .convertParametersToFilters()
          .getUrl({
            clean,
            originalQuestion: this,
            includeDisplayIsLocked,
            query: { objectId },
          });
      } else {
        const query = getParameterValuesBySlug(parameters, parameterValues);
        return questionWithParameters.markDirty().getUrl({
          clean,
          query,
          includeDisplayIsLocked,
        });
      }
    } else {
      return this.getUrl({
        clean,
        query: remapParameterValuesToTemplateTags(
          this.query().templateTags(),
          parameters,
          parameterValues,
        ),
        includeDisplayIsLocked,
      });
    }
  }

  getModerationReviews() {
    return getIn(this, ["_card", "moderation_reviews"]) || [];
  }
}
