// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { assoc, assocIn, chain, dissoc, getIn } from "icepick";
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
import BaseQuery from "metabase-lib/queries/Query";
import Metadata from "metabase-lib/metadata/Metadata";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import { AggregationDimension, FieldDimension } from "metabase-lib/Dimension";
import { isFK } from "metabase-lib/types/utils/isa";
import { sortObject } from "metabase-lib/utils";

import type {
  Card as CardObject,
  CollectionId,
  DatabaseId,
  DatasetColumn,
  DatasetQuery,
  DependentMetadataItem,
  TableId,
  RowValue,
  Parameter as ParameterObject,
  ParameterValues,
  ParameterId,
  VisualizationSettings,
} from "metabase-types/api";

import * as AGGREGATION from "metabase-lib/queries/utils/aggregation";
import * as FILTER from "metabase-lib/queries/utils/filter";
import * as QUERY from "metabase-lib/queries/utils/query";

// TODO: remove these dependencies
import { getCardUiParameters } from "metabase-lib/parameters/utils/cards";
import { utf8_to_b64url } from "metabase/lib/encoding";

import { getTemplateTagParametersFromCard } from "metabase-lib/parameters/utils/template-tags";
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
import type {
  ClickObject,
  ClickObjectDimension,
} from "metabase-lib/queries/drills/types";

import type { Query } from "./types";
import * as ML from "./v2";

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

/**
 * This is a wrapper around a question/card object, which may contain one or more Query objects
 */

class Question {
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
   * Question constructor
   */
  constructor(
    card: any,
    metadata?: Metadata,
    parameterValues?: ParameterValues,
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
        questions: {},
      });
    this._parameterValues = parameterValues || {};
  }

  clone() {
    return new Question(this._card, this._metadata, this._parameterValues);
  }

  metadata(): Metadata {
    return this._metadata;
  }

  card() {
    return this._doNotCallSerializableCard();
  }

  _doNotCallSerializableCard() {
    return this._card;
  }

  setCard(card: CardObject): Question {
    const q = this.clone();
    q._card = card;
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
  query = _.once((): AtomicQuery => {
    const datasetQuery = this._card.dataset_query;

    for (const QueryClass of [StructuredQuery, NativeQuery, InternalQuery]) {
      if (QueryClass.isDatasetQueryType(datasetQuery)) {
        return new QueryClass(this, datasetQuery);
      }
    }

    const isVirtualDashcard = !this._card.id;
    // `dataset_query` is null for questions on a dashboard the user don't have access to
    !isVirtualDashcard &&
      console.warn("Unknown query type: " + datasetQuery?.type);
  });

  isNative(): boolean {
    return this.query() instanceof NativeQuery;
  }

  isStructured(): boolean {
    return this.query() instanceof StructuredQuery;
  }

  setEnableEmbedding(enabled: boolean): Question {
    return this.setCard(assoc(this._card, "enable_embedding", enabled));
  }

  setEmbeddingParams(params: Record<string, any> | null): Question {
    return this.setCard(assoc(this._card, "embedding_params", params));
  }

  /**
   * Returns a new Question object with an updated query.
   * The query is saved to the `dataset_query` field of the Card object.
   */
  setQuery(newQuery: BaseQuery): Question {
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

  cacheTTL(): number | null {
    return this._card?.cache_ttl;
  }

  setCacheTTL(cache) {
    return this.setCard(assoc(this.card(), "cache_ttl", cache));
  }

  /**
   * returns whether this question is a model
   * @returns boolean
   */
  isDataset() {
    return this._card && this._card.dataset;
  }

  setDataset(dataset) {
    return this.setCard(assoc(this.card(), "dataset", dataset));
  }

  isPersisted() {
    return this._card && this._card.persisted;
  }

  setPersisted(isPersisted) {
    return this.setCard(assoc(this.card(), "persisted", isPersisted));
  }

  setPinned(pinned: boolean) {
    return this.setCard(
      assoc(this.card(), "collection_position", pinned ? 1 : null),
    );
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

  maybeResetDisplay(sensibleDisplays, previousSensibleDisplays): Question {
    const wasSensible =
      previousSensibleDisplays == null ||
      previousSensibleDisplays.includes(this.display());
    const isSensible = sensibleDisplays.includes(this.display());
    const shouldUnlock = wasSensible && !isSensible;
    const defaultDisplay = this.setDefaultDisplay().display();

    if (isSensible && defaultDisplay === "table") {
      // any sensible display is better than the default table display
      return this;
    }

    if (shouldUnlock && this.displayIsLocked()) {
      return this.setDisplayIsLocked(false).setDefaultDisplay();
    }

    return this.setDefaultDisplay();
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
   * How many filters or other widgets are this question's values used for?
   */
  getParameterUsageCount(): number {
    return this.card().parameter_usage_count || 0;
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

  canWriteActions(): boolean {
    const database = this.database();

    return (
      this.canWrite() &&
      database != null &&
      database.canWrite() &&
      database.hasActionsEnabled()
    );
  }

  supportsImplicitActions(): boolean {
    const query = this.query();

    // we want to check the metadata for the underlying table, not the model
    const table = query.sourceTable();

    const hasSinglePk =
      table?.fields?.filter(field => field.isPK())?.length === 1;

    return (
      query instanceof StructuredQuery && !query.hasAnyClauses() && hasSinglePk
    );
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
    dimensions: Dimension[] = [],
  ): Question {
    return pivot(this, breakouts, dimensions) || this;
  }

  drillUnderlyingRecords(
    dimensions: ClickObjectDimension[],
    column?: DatasetColumn,
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

  usesMetric(metricId): boolean {
    return (
      this.isStructured() &&
      _.any(
        QUERY.getAggregations(this.query().query()),
        aggregation => AGGREGATION.getMetric(aggregation) === metricId,
      )
    );
  }

  usesSegment(segmentId): boolean {
    return (
      this.isStructured() &&
      QUERY.getFilters(this.query().query()).some(
        filter => FILTER.isSegment(filter) && filter[1] === segmentId,
      )
    );
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

  composeDataset(): Question {
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

  drillPK(field: Field, value: RowValue): Question | null | undefined {
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

  private _syncStructuredQueryColumnsAndSettings(
    previousQuestion,
    previousQuery,
  ) {
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
      (addedColumnNames.length > 0 || removedColumnNames.length > 0)
    ) {
      const addedMetricColumnNames = addedColumnNames.filter(
        name =>
          query.columnDimensionWithName(name) instanceof AggregationDimension,
      );

      const removedMetricColumnNames = removedColumnNames.filter(
        name =>
          previousQuery.columnDimensionWithName(name) instanceof
          AggregationDimension,
      );

      if (
        addedMetricColumnNames.length > 0 ||
        removedMetricColumnNames.length > 0
      ) {
        return this.updateSettings({
          "graph.metrics": [
            ..._.difference(graphMetrics, removedMetricColumnNames),
            ...addedMetricColumnNames,
          ],
        });
      }
    }

    const tableColumns = this.setting("table.columns");
    if (
      tableColumns &&
      (addedColumnNames.length > 0 || removedColumnNames.length > 0)
    ) {
      return this.updateSettings({
        "table.columns": [
          ...tableColumns.filter(
            column =>
              !removedColumnNames.includes(column.name) &&
              !addedColumnNames.includes(column.name),
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
    return this._card && this._card.name;
  }

  slug(): string | null | undefined {
    return this._card?.name && `${this._card.id}-${slugg(this._card.name)}`;
  }

  setDisplayName(name: string | null | undefined) {
    return this.setCard(assoc(this.card(), "name", name));
  }

  collectionId(): number | null | undefined {
    return this._card && this._card.collection_id;
  }

  setCollectionId(collectionId: number | null | undefined) {
    return this.setCard(assoc(this.card(), "collection_id", collectionId));
  }

  id(): number {
    return this._card && this._card.id;
  }

  setId(id: number | undefined): Question {
    return this.setCard(assoc(this.card(), "id", id));
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

  description(): string | null {
    return this._card && this._card.description;
  }

  setDescription(description) {
    return this.setCard(assoc(this.card(), "description", description));
  }

  lastEditInfo() {
    return this._card && this._card["last-edit-info"];
  }

  lastQueryStart() {
    return this._card?.last_query_start;
  }

  isSaved(): boolean {
    return !!this.id();
  }

  publicUUID(): string {
    return this._card && this._card.public_uuid;
  }

  setPublicUUID(public_uuid: string | null): Question {
    return this.setCard({ ...this._card, public_uuid });
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

  isArchived(): boolean {
    return this._card && this._card.archived;
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

  setParameter(id: ParameterId, parameter: ParameterObject) {
    const newParameters = this.parameters().map(oldParameter =>
      oldParameter.id === id ? parameter : oldParameter,
    );

    return this.setParameters(newParameters);
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
    return getCardUiParameters(
      this.card(),
      this.metadata(),
      this._parameterValues,
    );
  }

  // predicate function that determines if the question is "dirty" compared to the given question
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
    const cardCopy = {
      name: this._card.name,
      description: this._card.description,
      collection_id: this._card.collection_id,
      dataset_query: query.datasetQuery(),
      display: this._card.display,
      parameters: this._card.parameters,
      dataset: this._card.dataset,
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

  _convertParametersToMbql(): Question {
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

  _getMLv2Query(metadata = this._metadata): Query {
    // cache the metadata provider we create for our metadata.
    if (metadata === this._metadata) {
      if (!this.__mlv2MetadataProvider) {
        this.__mlv2MetadataProvider = ML.metadataProvider(
          this.databaseId(),
          metadata,
        );
      }
      metadata = this.__mlv2MetadataProvider;
    }

    if (this.__mlv2QueryMetadata !== metadata) {
      this.__mlv2QueryMetadata = null;
      this.__mlv2Query = null;
    }

    if (!this.__mlv2Query) {
      this.__mlv2QueryMetadata = metadata;
      this.__mlv2Query = ML.fromLegacyQuery(
        this.databaseId(),
        metadata,
        this.datasetQuery(),
      );
    }

    return this.__mlv2Query;
  }

  generateQueryDescription() {
    const query = this._getMLv2Query();
    return ML.suggestedName(query);
  }

  getModerationReviews() {
    return getIn(this, ["_card", "moderation_reviews"]) || [];
  }

  /**
   * We can only "explore results" (i.e. create new questions based on this one)
   * when question is a native query, which is saved, has no parameters
   * and satisfies other conditionals below.
   */
  canExploreResults() {
    return (
      this.isNative() &&
      this.isSaved() &&
      this.parameters().length === 0 &&
      this.query().canNest() &&
      !this.query().readOnly() // originally "canRunAdhocQuery"
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

    return new Question(card, metadata, parameterValues);
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Question;
