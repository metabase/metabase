// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { assocIn } from "icepick";
import * as Q from "cljs/metabase.domain_entities.question";
/* eslint-disable import/order */
// NOTE: the order of these matters due to circular dependency issues
import slugg from "slugg";
import StructuredQuery, {
  STRUCTURED_QUERY_TEMPLATE,
} from "metabase-lib/queries/StructuredQuery";
import NativeQuery, {
  NATIVE_QUERY_TEMPLATE,
} from "metabase-lib/queries/NativeQuery";
import AtomicQuery from "metabase-lib/queries/AtomicQuery";
import InternalQuery from "metabase-lib/queries/InternalQuery";
import Query from "metabase-lib/queries/Query";
import Metadata from "metabase-lib/metadata/Metadata";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import { AggregationDimension, FieldDimension } from "metabase-lib/Dimension";
import { isFK } from "metabase-lib/types/utils/isa";
import { memoizeClass, sortObject } from "metabase-lib/utils";

// TODO: remove these dependencies
import * as Urls from "metabase/lib/urls";
import { getCardUiParameters } from "metabase-lib/parameters/utils/cards";
import {
  DashboardApi,
  CardApi,
  maybeUsePivotEndpoint,
  MetabaseApi,
} from "metabase/services";
import { ParameterValues } from "metabase-types/types/Parameter";
import { Card as CardObject, DatasetQuery } from "metabase-types/types/Card";
import { VisualizationSettings } from "metabase-types/api/card";
import { Column, Dataset, Value } from "metabase-types/types/Dataset";
import { TableId } from "metabase-types/types/Table";
import { DatabaseId } from "metabase-types/types/Database";
import {
  ClickObject,
  DimensionValue,
} from "metabase-types/types/Visualization";
import { DependentMetadataItem } from "metabase-types/types/Query";
import { utf8_to_b64url } from "metabase/lib/encoding";
import {
  CollectionId,
  Parameter as ParameterObject,
  ParameterId,
} from "metabase-types/api";

import {
  getParameterValuesBySlug,
  normalizeParameters,
} from "metabase-lib/parameters/utils/parameter-values";
import {
  getTemplateTagParametersFromCard,
  remapParameterValuesToTemplateTags,
} from "metabase-lib/parameters/utils/template-tags";
import { fieldFilterParameterToMBQLFilter } from "metabase-lib/parameters/utils/mbql";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";
import {
  aggregate,
  breakout,
  distribution,
  drillFilter,
  filter,
  pivot,
} from "metabase-lib/queries/utils/actions";
import { isTransientId } from "metabase-lib/queries/utils/card";
import {
  findColumnIndexForColumnSetting,
  findColumnSettingIndexForColumn,
  syncTableColumnsToQuery,
} from "metabase-lib/queries/utils/dataset";
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "metabase-lib/Alert";
import { getBaseDimensionReference } from "metabase-lib/references";

export type QuestionCreatorOpts = {
  databaseId?: DatabaseId;
  dataset?: boolean;
  tableId?: TableId;
  collectionId?: CollectionId;
  metadata?: Metadata;
  parameterValues?: ParameterValues;
  type?: "query" | "native";
  name?: string;
  display?: string;
  visualization_settings?: VisualizationSettings;
  dataset_query?: DatasetQuery;
};

interface QuestionContents {
  /**
   * The plain object presentation of this question, equal to the format that Metabase REST API understands.
   * It is called `card` for both historical reasons and to make a clear distinction to this class.
   */
  readonly card: CardObject;

  /**
   * The Question wrapper requires a metadata object because the queries it contains (like {@link StructuredQuery})
   * need metadata for accessing databases, tables and metrics.
   */
  readonly metadata: Metadata;

  /**
   * Parameter values mean either the current values of dashboard filters or SQL editor template parameters.
   * They are in the grey area between UI state and question state, but having them in Question wrapper is convenient.
   */
  readonly parameterValues: ParameterValues;
}

type CLJS<_T> = unknown;

/**
 * This is a wrapper around a question/card object, which may contain one or more Query objects
 */
class QuestionInner {
  /**
   * All data for the Question is held in a CLJS container.
   */
  private readonly _inner: CLJS<QuestionContents>;

  /**
   * Question constructor
   */
  constructor(contents: QuestionContents) {
    this._inner = Q.from_js(contents);
  }

  clone() {
    return buildQuestion(this._inner);
  }

  private inner(): CLJS<QuestionContents> {
    return this._inner;
  }

  metadata(): Metadata {
    const metadata = Q.metadata(this.inner());
    if (!metadata) {
      return new Metadata({
        databases: {},
        tables: {},
        fields: {},
        metrics: {},
        segments: {},
        questions: {},
      });
    } else if (metadata instanceof Metadata) {
      return metadata;
    } else {
      return new Metadata(metadata);
    }
  }

  card() {
    return Q.card_js(this.inner());
  }

  parameterValues() {
    return Q.parameter_values_js(this.inner()) || {};
  }

  setCard(card: CardObject): Question {
    const inner = Q.with_card(this.inner(), card);
    const nu = buildQuestion(inner);
    return nu;
  }

  withoutNameAndId(): Question {
    return buildQuestion(Q.without_name_and_id(this.inner()));
  }

  omitTransientCardIds(): Question {
    // omit_transient_card_ids returns this, unchanged, if there's nothing for it to do.
    const question = Q.omit_transient_card_ids(this.inner(), this);
    return question instanceof Question ? question : buildQuestion(question);
  }

  /**
   * A question contains either a:
   * - StructuredQuery for queries written in MBQL
   * - NativeQuery for queries written in data source's native query language
   *
   * This is just a wrapper object, the data is stored in `this._inner.card.dataset_query` in a format specific to the query type.
   */
  query(): AtomicQuery {
    const datasetQuery = this.datasetQuery();

    for (const QueryClass of [StructuredQuery, NativeQuery, InternalQuery]) {
      if (QueryClass.isDatasetQueryType(datasetQuery)) {
        return new QueryClass(this, datasetQuery);
      }
    }

    console.warn("Unknown query type: " + datasetQuery?.type, datasetQuery);
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
    // TODO Check if the query is identical, and just return this.
    return buildQuestion(
      Q.with_dataset_query(this.inner(), newQuery.datasetQuery()),
    );
  }

  datasetQuery(): DatasetQuery {
    return Q.dataset_query_js(this.inner());
  }

  setDatasetQuery(newDatasetQuery: DatasetQuery): Question {
    return buildQuestion(Q.with_dataset_query(this.inner(), newDatasetQuery));
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
    return Q.display(this.inner());
  }

  setDisplay(display) {
    return buildQuestion(Q.with_display(this.inner(), display));
  }

  cacheTTL(): number | null {
    return Q.cache_ttl(this.inner());
  }

  setCacheTTL(cache) {
    return buildQuestion(Q.with_cache_ttl(this.inner(), cache));
  }

  /**
   * returns whether this question is a model
   * @returns boolean
   */
  isDataset() {
    return !!Q.dataset(this.inner());
  }

  isPersisted() {
    return !!Q.persisted(this.inner());
  }

  setPersisted(isPersisted) {
    return buildQuestion(Q.with_persisted(this.inner(), isPersisted));
  }

  setDataset(dataset) {
    return buildQuestion(Q.with_dataset(this.inner(), dataset));
  }

  setPinned(pinned: boolean) {
    return buildQuestion(
      Q.with_collection_position(this.inner(), pinned ? 1 : null),
    );
  }

  // locking the display prevents auto-selection
  lockDisplay(): Question {
    return this.setDisplayIsLocked(true);
  }

  setDisplayIsLocked(locked: boolean): Question {
    return buildQuestion(Q.with_display_is_locked(this.inner(), locked));
  }

  displayIsLocked(): boolean {
    return !!Q.display_is_locked(this.inner());
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
    return this.query().setDefaultQuery().question();
  }

  settings(): VisualizationSettings {
    return Q.settings_js(this.inner()) || {};
  }

  setting(settingName, defaultValue = undefined) {
    return Q.setting(this.inner(), settingName, defaultValue);
  }

  setSettings(settings: VisualizationSettings) {
    return buildQuestion(Q.with_settings(this.inner(), settings));
  }

  updateSettings(settings: VisualizationSettings) {
    return buildQuestion(Q.merge_settings(this.inner(), settings));
  }

  type(): string {
    return Q.dataset_query_type(this.inner());
  }

  creationType(): string {
    return Q.creation_type(this.inner());
  }

  isEmpty(): boolean {
    return this.query().isEmpty();
  }

  /**
   * How many filters or other widgets are this question's values used for?
   */
  getParameterUsageCount(): number {
    return Q.parameter_usage_count(this.inner()) || 0;
  }

  /**
   * Question is valid (as far as we know) and can be executed
   */
  canRun(): boolean {
    return this.query().canRun();
  }

  canWrite(): boolean {
    return !!Q.can_write(this.inner());
  }

  canWriteActions(): boolean {
    const database = this.database();
    const hasActionsEnabled = database != null && database.hasActionsEnabled();
    return this.canWrite() && hasActionsEnabled;
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

  pivot(
    breakouts: (Breakout | Dimension | Field)[] = [],
    dimensions = [],
  ): Question {
    return pivot(this, breakouts, dimensions) || this;
  }

  drillUnderlyingRecords(
    dimensions: DimensionValue[],
    column?: Column,
  ): Question {
    let query = this.query();
    if (!(query instanceof StructuredQuery)) {
      return this;
    }

    dimensions.forEach(({ value, column }) => {
      if (column.source !== "aggregation") {
        query = drillFilter(query, value, column);
      }
    });

    const dimension = column && query.parseFieldReference(column.field_ref);
    if (dimension instanceof AggregationDimension) {
      const aggregation = dimension.aggregation();
      const filters = aggregation ? aggregation.filters() : [];
      query = filters.reduce((query, filter) => query.filter(filter), query);
    }

    return query.question().toUnderlyingRecords();
  }

  toUnderlyingRecords(): Question {
    const query = this.query();
    if (!(query instanceof StructuredQuery)) {
      return this;
    }

    return query
      .clearAggregations()
      .clearBreakouts()
      .clearSort()
      .clearLimit()
      .clearFields()
      .question()
      .setDisplay("table");
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
            "source-table": getQuestionVirtualTableId(this.id()),
          },
        },
      };
      return this.setCard(card);
    }
  }

  composeDataset() {
    if (!this.isDataset() || !this.isSaved()) {
      return this;
    }

    return this.setDatasetQuery({
      type: "query",
      database: this.databaseId(),
      query: {
        "source-table": getQuestionVirtualTableId(this.id()),
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

    const graphMetrics = this.setting("graph.metrics");
    if (
      graphMetrics &&
      addedColumnNames.length > 0 &&
      removedColumnNames.length === 0
    ) {
      const addedMetricColumnNames = addedColumnNames.filter(
        name =>
          query.columnDimensionWithName(name) instanceof AggregationDimension,
      );

      if (addedMetricColumnNames.length > 0) {
        return this.updateSettings({
          "graph.metrics": [...graphMetrics, ...addedMetricColumnNames],
        });
      }
    }

    const tableColumns = this.setting("table.columns");
    if (
      tableColumns &&
      addedColumnNames.length > 0 &&
      removedColumnNames.length === 0
    ) {
      return this.updateSettings({
        "table.columns": [
          ...tableColumns.filter(
            column => !addedColumnNames.includes(column.name),
          ),
          ...addedColumnNames.map(name => {
            const dimension = query.columnDimensionWithName(name);
            return {
              name: name,
              fieldRef: getBaseDimensionReference(dimension.mbql()),
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

  /**
   * A user-defined name for the question
   */
  displayName(): string | null | undefined {
    return Q.display_name(this.inner()) || undefined;
  }

  slug(): string | null | undefined {
    // TODO Get an identical slug algorithm into CLJS. For now, keeping this logic in TS.
    const id = Q.card_id(this.inner());
    const name = Q.display_name(this.inner());
    return name && `${id}-${slugg(name)}`;
  }

  setDisplayName(name: string | null | undefined) {
    return buildQuestion(Q.with_display_name(this.inner(), name));
  }

  collectionId(): number | null | undefined {
    return Q.collection_id(this.inner());
  }

  setCollectionId(collectionId: number | null | undefined) {
    return buildQuestion(Q.with_collection_id(this.inner(), collectionId));
  }

  id(): number {
    return Q.card_id(this.inner()) || undefined;
  }

  markDirty(): Question {
    return buildQuestion(Q.mark_dirty(this.inner()));
  }

  setDashboardProps({
    dashboardId,
    dashcardId,
  }:
    | { dashboardId: number; dashcardId: number }
    | { dashboardId: undefined; dashcardId: undefined }): Question {
    return buildQuestion(
      Q.with_dashboard_props(this.inner(), dashboardId, dashcardId),
    );
  }

  description(): string | null {
    return Q.description(this.inner());
  }

  setDescription(description) {
    return buildQuestion(Q.with_description(this.inner(), description));
  }

  lastEditInfo() {
    return Q.last_edit_info(this.inner());
  }

  lastQueryStart() {
    return Q.last_query_start(this.inner());
  }

  isSaved(): boolean {
    return !!this.id();
  }

  publicUUID(): string {
    return Q.public_uuid(this.inner());
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
    ...options
  }: {
    originalQuestion?: Question;
    clean?: boolean;
    query?: Record<string, any>;
    includeDisplayIsLocked?: boolean;
    creationType?: string;
  } = {}): string {
    // clean,
    // originalQuestion: this,
    // includeDisplayIsLocked,
    // query: { objectId },

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
      const adHocQuery = utf8_to_b64url(JSON.stringify(this.datasetQuery()));
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
    return buildQuestion(
      Q.with_result_metadata(this.inner(), resultsMetadata?.columns),
    );
  }

  getResultMetadata() {
    return Q.result_metadata(this.inner()) || [];
  }

  dependentMetadata(): DependentMetadataItem[] {
    const dependencies = [];

    // we frequently treat dataset/model questions like they are already nested
    // so we need to fetch the virtual card table representation of the Question
    // so that we can properly access the table's fields in various scenarios
    if (this.isDataset() && this.isSaved()) {
      dependencies.push({
        type: "table",
        id: getQuestionVirtualTableId(this.id()),
      });
    }

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
  isEqual(other, { compareResultsMetadata = true } = {}): boolean {
    return Q.is_equal(this.inner(), other.inner(), compareResultsMetadata);
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
    const parameters = normalizeParameters(this.parameters());

    if (canUseCardApiEndpoint) {
      const dashboardId = Q.dashboard_id(this.inner());
      const dashcardId = Q.dashcard_id(this.inner());

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

  setParameter(id: ParameterId, parameter: ParameterObject): Question {
    const newParameters = this.parameters().map(oldParameter =>
      oldParameter.id === id ? parameter : oldParameter,
    );

    return this.setParameters(newParameters);
  }

  setParameters(parameters: ParameterObject[]): Question {
    return buildQuestion(Q.with_card_parameters(this.inner(), parameters));
  }

  setParameterValues(parameterValues) {
    return buildQuestion(
      Q.with_parameter_values(this.inner(), parameterValues),
    );
  }

  // TODO: Fix incorrect Flow signature
  parameters(): ParameterObject[] {
    return getCardUiParameters(
      this.card(),
      this.metadata(),
      this.parameterValues(),
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
    // TODO Port this - it uses card() but it's too tangled up with serialization to tackle right now.
    const [a, b] = [this, originalQuestion].map(q => {
      return (
        q &&
        buildQuestion({ card: q.card(), metadata: Q.metadata(this.inner) })
          .setParameters(getTemplateTagParametersFromCard(q.card()))
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
    const card = this.card();
    const cardCopy = {
      name: card.name,
      description: card.description,
      collection_id: card.collection_id,
      dataset_query: query.datasetQuery(),
      display: card.display,
      parameters:
        (card.parameters?.length ?? 0) > 0 ? card.parameters : undefined,
      dataset: card.dataset,
      ...(_.isEmpty(this.parameterValues())
        ? undefined
        : {
            parameterValues: this.parameterValues(),
          }),
      // this is kinda wrong. these values aren't really part of the card, but this is a convenient place to put them
      visualization_settings: card.visualization_settings,
      ...(includeOriginalCardId
        ? {
            original_card_id: card.original_card_id,
          }
        : {}),
      ...(includeDisplayIsLocked
        ? {
            displayIsLocked: card.displayIsLocked,
          }
        : {}),

      ...(creationType ? { creationType } : {}),
      dashboardId: card.dashboardId,
      dashcardId: card.dashcardId,
    };
    return utf8_to_b64url(JSON.stringify(sortObject(cardCopy)));
  }

  convertParametersToMbql() {
    if (!this.isStructured()) {
      return this;
    }

    const mbqlFilters = this.parameters()
      .map(parameter => {
        return fieldFilterParameterToMBQLFilter(parameter, this.metadata());
      })
      .filter(mbqlFilter => mbqlFilter != null);

    const query = mbqlFilters.reduce((query, mbqlFilter) => {
      return query.filter(mbqlFilter);
    }, this.query());

    const hasQueryBeenAltered = mbqlFilters.length > 0;

    const question = query
      .question()
      .setParameters(undefined)
      .setParameterValues(undefined);

    return hasQueryBeenAltered ? question.markDirty() : question;
  }

  getUrlWithParameters(parameters, parameterValues, { objectId, clean } = {}) {
    const includeDisplayIsLocked = true;

    if (this.isStructured()) {
      const questionWithParameters = this.setParameters(parameters);

      if (!this.query().readOnly()) {
        return questionWithParameters
          .setParameterValues(parameterValues)
          .convertParametersToMbql()
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
    return Q.moderation_reviews_js(this.inner()) || [];
  }
}

export function buildQuestion(
  contents: QuestionContents | CLJS<QuestionContents>,
): Question {
  return new Question(contents);
}

export default class Question extends memoizeClass<QuestionInner>("query")(
  QuestionInner,
) {
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
    dataset,
    dataset_query = type === "native"
      ? NATIVE_QUERY_TEMPLATE
      : STRUCTURED_QUERY_TEMPLATE,
  }: QuestionCreatorOpts = {}) {
    let card: CardObject = {
      name,
      collection_id: collectionId,
      display,
      visualization_settings,
      dataset,
      dataset_query,
    };

    if (type === "native") {
      card = assocIn(card, ["parameters"], []);
    }

    if (tableId != null) {
      card = assocIn(card, ["dataset_query", "query", "source-table"], tableId);
    }

    if (databaseId != null) {
      card = assocIn(card, ["dataset_query", "database"], databaseId);
    }

    return buildQuestion({ card, metadata, parameterValues });
  }
}
