// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { assoc, assocIn, chain, dissoc, getIn } from "icepick";
import slugg from "slugg";
import _ from "underscore";

import { utf8_to_b64url } from "metabase/lib/encoding";
import { applyParameter } from "metabase/querying/parameters/utils/query";
import * as Lib from "metabase-lib";
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "metabase-lib/v1/Alert";
import type { NotificationTriggerType } from "metabase-lib/v1/Alert/constants";
import type Database from "metabase-lib/v1/metadata/Database";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import type Table from "metabase-lib/v1/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import { getTemplateTagParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import { InternalQuery } from "metabase-lib/v1/queries/InternalQuery";
import NativeQuery, {
  NATIVE_QUERY_TEMPLATE,
} from "metabase-lib/v1/queries/NativeQuery";
import { STRUCTURED_QUERY_TEMPLATE } from "metabase-lib/v1/queries/StructuredQuery";
import { isTransientId } from "metabase-lib/v1/queries/utils/card";
import { sortObject } from "metabase-lib/v1/utils";
import type {
  CardDisplayType,
  Card as CardObject,
  CardType,
  CollectionId,
  DashCardId,
  Dashboard,
  DashboardId,
  DatabaseId,
  DatasetData,
  DatasetQuery,
  Field,
  LastEditInfo,
  ParameterDimensionTarget,
  ParameterId,
  Parameter as ParameterObject,
  ParameterValuesMap,
  TableId,
  UserInfo,
  VisualizationSettings,
} from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";

import type { Query } from "../types";

export type QuestionCreatorOpts = {
  databaseId?: DatabaseId;
  cardType?: CardType;
  tableId?: TableId;
  collectionId?: CollectionId;
  dashboardId?: DashboardId;
  metadata?: Metadata;
  parameterValues?: ParameterValuesMap;
  type?: "query" | "native";
  name?: string;
  display?: CardDisplayType;
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
  _parameterValues: ParameterValuesMap;

  private __mlv2Query: Lib.Query | undefined;

  private __mlv2MetadataProvider: Lib.MetadataProvider | undefined;

  /**
   * Question constructor
   */
  constructor(
    card: any,
    metadata?: Metadata,
    parameterValues?: ParameterValuesMap,
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
  _legacyNativeQuery = _.once((): NativeQuery | undefined => {
    const datasetQuery = this._card.dataset_query;

    if (NativeQuery.isDatasetQueryType(datasetQuery)) {
      return new NativeQuery(this, datasetQuery);
    }

    const isVirtualDashcard = !this._card.id;
    // The `dataset_query` is null for questions on a dashboard the user doesn't have access to
    !isVirtualDashcard &&
      console.warn("Unknown query type: " + datasetQuery?.type);
  });

  legacyNativeQuery(): NativeQuery | undefined {
    return this._legacyNativeQuery();
  }

  /**
   * Returns a new Question object with an updated query.
   * The query is saved to the `dataset_query` field of the Card object.
   */
  setLegacyQuery(newQuery: NativeQuery): Question {
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
   * The visualization type of the question
   */
  display(): CardDisplayType {
    return this._card && this._card.display;
  }

  setDisplay(display: CardDisplayType) {
    return this.setCard(assoc(this.card(), "display", display));
  }

  type(): CardType {
    return this._card?.type ?? "question";
  }

  setType(type: CardType) {
    return this.setCard(assoc(this.card(), "type", type));
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

  setArchived(archived: boolean) {
    return this.setCard(assoc(this.card(), "archived", archived));
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

  maybeResetDisplay(
    data: DatasetData,
    sensibleDisplays: string[],
    previousSensibleDisplays: string[] | undefined,
  ): Question {
    const wasSensible =
      previousSensibleDisplays == null ||
      previousSensibleDisplays.includes(this.display());
    const isSensible = sensibleDisplays.includes(this.display());
    const shouldUnlock = wasSensible && !isSensible;
    const defaultDisplay = this.setDefaultDisplay().display();

    let question;
    if (isSensible && defaultDisplay === "table") {
      // any sensible display is better than the default table display
      question = this;
    } else if (shouldUnlock && this.displayIsLocked()) {
      question = this.setDisplayIsLocked(false).setDefaultDisplay();
    } else {
      question = this.setDefaultDisplay();
    }

    return question._maybeSwitchToScalar(data);
  }

  // Switches display to scalar if the data is 1 row x 1 column
  private _maybeSwitchToScalar({ rows, cols }): Question {
    const isScalar = ["scalar", "progress", "gauge"].includes(this.display());
    const isOneByOne = rows.length === 1 && cols.length === 1;
    if (!isScalar && isOneByOne && !this.displayIsLocked()) {
      return this.setDisplay("scalar");
    }
    return this;
  }

  setDefaultDisplay(): Question {
    if (this.displayIsLocked()) {
      return this;
    }

    const query = this.query();
    const { display, settings = {} } = Lib.defaultDisplay(query);

    return this.setDisplay(display).updateSettings(settings);
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

  updateSettings(settings: Partial<VisualizationSettings>) {
    return this.setSettings({ ...this.settings(), ...settings });
  }

  creationType(): string {
    return this.card().creationType;
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
    const { isNative } = Lib.queryDisplayInfo(this.query());
    return isNative
      ? this.legacyNativeQuery().canRun()
      : Lib.canRun(this.query(), this.type());
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
    const sourceTableId = Lib.sourceTableOrCardId(query);
    const table = this.metadata().table(sourceTableId);

    const hasSinglePk =
      table?.fields?.filter((field) => field.isPK())?.length === 1;
    const { isNative } = Lib.queryDisplayInfo(this.query());

    return !isNative && !Lib.hasClauses(query, -1) && hasSinglePk;
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
  alertType(visualizationSettings): NotificationTriggerType | null {
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

  composeQuestion(): Question {
    if (!this.isSaved()) {
      return this;
    }

    const metadata = this.metadataProvider();
    const tableId = getQuestionVirtualTableId(this.id());
    const table = Lib.tableOrCardMetadata(metadata, tableId);
    if (!table) {
      return this;
    }

    const query = Lib.queryFromTableOrCardMetadata(metadata, table);
    return this.setQuery(query);
  }

  composeQuestionAdhoc(): Question {
    if (!this.isSaved()) {
      return this;
    }

    const query = this.composeQuestion().query();
    return Question.create({ metadata: this.metadata() }).setQuery(query);
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

  collection(): Collection | null | undefined {
    return this?._card?.collection;
  }

  collectionId(): CollectionId | null | undefined {
    return this._card && this._card.collection_id;
  }

  setCollectionId(collectionId: CollectionId | null | undefined) {
    return this.setCard(assoc(this.card(), "collection_id", collectionId));
  }

  dashboard(): Dashboard | undefined {
    return this._card.dashboard;
  }

  dashboardId(): DashboardId | null {
    return this._card.dashboard_id;
  }

  dashboardName(): string | undefined {
    // NOTE: We could localize the name later
    return this._card?.dashboard?.name ?? undefined;
  }

  dashboardCount(): number {
    return this._card.dashboard_count;
  }

  setDashboardId(dashboardId: DashboardId | null | undefined) {
    return this.setCard(assoc(this.card(), "dashboard_id", dashboardId));
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
    | { dashboardId: DashboardId; dashcardId: DashCardId }
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

  lastEditInfo(): LastEditInfo {
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

  database(): Database | null {
    const metadata = this.metadata();
    const databaseId = this.databaseId();
    const database = metadata.database(databaseId);
    return database;
  }

  databaseId(): DatabaseId | null {
    const query = this.query();
    return Lib.databaseID(query);
  }

  legacyQueryTable(): Table | null {
    const query = this.query();
    const { isNative } = Lib.queryDisplayInfo(query);
    if (isNative) {
      return this.legacyNativeQuery().table();
    } else {
      const tableId = Lib.sourceTableOrCardId(query);
      const metadata = this.metadata();
      return metadata.table(tableId);
    }
  }

  legacyQueryTableId(): TableId | null {
    const table = this.legacyQueryTable();
    return table ? table.id : null;
  }

  isArchived(): boolean {
    return this._card && this._card.archived;
  }

  getResultMetadata() {
    return this.card().result_metadata ?? [];
  }

  setResultsMetadata(resultsMetadata) {
    const metadataColumns = resultsMetadata && resultsMetadata.columns;
    return this.setCard({
      ...this.card(),
      result_metadata: metadataColumns,
    });
  }

  setResultMetadataDiff(metadataDiff: Record<string, Partial<Field>>) {
    const metadata = this.getResultMetadata();
    const newMetadata = metadata.map((column) => {
      const columnDiff = metadataDiff[column.name];
      return columnDiff ? { ...column, ...columnDiff } : column;
    });
    return this.setResultsMetadata({ columns: newMetadata });
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
    const newParameters = this.parameters().map((oldParameter) =>
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

  private _getParameters = _.memoize((collectionPreview: boolean) => {
    return getCardUiParameters(
      this.card(),
      this.metadata(),
      this._parameterValues,
      undefined,
      collectionPreview,
    );
  });

  parameters({ collectionPreview } = {}): ParameterObject[] {
    return this._getParameters(collectionPreview);
  }

  // predicate function that determines if the question is "dirty" compared to the given question
  isDirtyComparedTo(originalQuestion: Question) {
    if (!this.isSaved() && this.canRun() && originalQuestion == null) {
      // If it's new, then it's dirty if it is runnable
      return true;
    } else {
      // If it's saved, then it's dirty when the current card doesn't match the last saved version.
      // Omit `entity_id` and `dataset_query` as they have randomized idents
      const origCardSerialized =
        originalQuestion &&
        originalQuestion._serializeForUrl({
          includeEntityId: false,
          includeDatasetQuery: false,
          includeOriginalCardId: false,
        });
      const currentCardSerialized = this._serializeForUrl({
        includeEntityId: false,
        includeDatasetQuery: false,
        includeOriginalCardId: false,
      });
      if (currentCardSerialized !== origCardSerialized) {
        return true;
      }

      return !Lib.areLegacyQueriesEqual(
        this.datasetQuery(),
        originalQuestion.datasetQuery(),
      );
    }
  }

  isDirtyComparedToWithoutParameters(originalQuestion: Question) {
    const [a, b] = [this, originalQuestion].map((q) => {
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

  isQueryDirtyComparedTo(originalQuestion: Question) {
    return !Lib.areLegacyQueriesEqual(
      this.datasetQuery(),
      originalQuestion.datasetQuery(),
    );
  }

  // Internal methods
  _serializeForUrl({
    includeEntityId = true,
    includeDatasetQuery = true,
    includeOriginalCardId = true,
    includeDisplayIsLocked = false,
    creationType,
  }: {
    includeEntityId?: boolean;
    includeDatasetQuery?: boolean;
    includeOriginalCardId?: boolean;
    includeDisplayIsLocked?: boolean;
    creationType?: string;
  } = {}) {
    const card = this._card;
    const cardCopy = {
      name: card.name,
      description: card.description,
      collection_id: card.collection_id,
      dashboard_id: card.dashboard_id,
      ...(includeEntityId ? { entity_id: card.entity_id } : {}),
      ...(includeDatasetQuery
        ? { dataset_query: Lib.toLegacyQuery(this.query()) }
        : {}),
      display: card.display,
      ...(_.isEmpty(card.parameters)
        ? undefined
        : {
            parameters: card.parameters,
          }),
      type: card.type,
      ...(_.isEmpty(this._parameterValues)
        ? undefined
        : {
            parameterValues: this._parameterValues,
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

  _convertParametersToMbql({ isComposed }: { isComposed: boolean }): Question {
    const query = this.query();
    const { isNative } = Lib.queryDisplayInfo(query);

    if (isNative) {
      return this;
    }

    // If the query is composed (models or metrics) we cannot add filters to the underlying query since that query is used for data source.
    // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations.
    const queryWithExtraStage =
      !isComposed && this.display() !== "pivot"
        ? Lib.ensureFilterStage(query)
        : query;
    const queryWithFilters = this.parameters().reduce((newQuery, parameter) => {
      const stageIndex =
        isDimensionTarget(parameter.target) && !isComposed
          ? getParameterDimensionTargetStageIndex(parameter.target)
          : -1;
      return applyParameter(
        newQuery,
        stageIndex,
        parameter.type,
        parameter.target,
        parameter.value,
      );
    }, queryWithExtraStage);
    const queryWithFiltersWithoutExtraStage =
      Lib.dropEmptyStages(queryWithFilters);

    const newQuestion = this.setQuery(queryWithFiltersWithoutExtraStage)
      .setParameters(undefined)
      .setParameterValues(undefined);

    const hasQueryBeenAltered = queryWithExtraStage !== queryWithFilters;
    return hasQueryBeenAltered ? newQuestion.markDirty() : newQuestion;

    function getParameterDimensionTargetStageIndex(
      target: ParameterDimensionTarget,
    ) {
      const [_type, _variableTarget, options] = target;
      return options?.["stage-number"] ?? -1;
    }
  }

  query(): Query {
    if (InternalQuery.isDatasetQueryType(this.datasetQuery())) {
      throw new Error("Internal query is not supported by MLv2");
    }

    this.__mlv2Query ??= Lib.fromLegacyQuery(
      this.datasetQuery()?.database,
      this.metadataProvider(),
      this.datasetQuery(),
    );

    // Helpers for working with the current query from CLJS REPLs.
    if (process.env.NODE_ENV === "development") {
      window.__MLv2_metadata = this.__mlv2MetadataProvider;
      window.__MLv2_query = this.__mlv2Query;
      window.Lib = Lib;
    }

    return this.__mlv2Query;
  }

  private metadataProvider(): Lib.MetadataProvider {
    this.__mlv2MetadataProvider ??= Lib.metadataProvider(
      this.datasetQuery()?.database,
      this.metadata(),
    );
    return this.__mlv2MetadataProvider;
  }

  setQuery(query: Query): Question {
    return this.setDatasetQuery(Lib.toLegacyQuery(query));
  }

  generateQueryDescription() {
    const query = this.query();
    return Lib.suggestedName(query);
  }

  getModerationReviews() {
    return getIn(this, ["_card", "moderation_reviews"]) || [];
  }

  getCreator(): UserInfo {
    return getIn(this, ["_card", "creator"]) || "";
  }

  getCreatedAt(): string {
    return getIn(this, ["_card", "created_at"]) || "";
  }

  canManageDB(): boolean {
    return this.card().can_manage_db || false;
  }

  /** Applies the template tag parameters from the card to the question. */
  applyTemplateTagParameters(): Question {
    const { isNative } = Lib.queryDisplayInfo(this.query());

    if (!isNative) {
      return this;
    }

    return this.setParameters(getTemplateTagParametersFromCard(this.card()));
  }

  /**
   * TODO Atte Keinänen 6/13/17: Discussed with Tom that we could use the default Question constructor instead,
   * but it would require changing the constructor signature so that `card` is an optional parameter and has a default value
   */
  static create({
    databaseId,
    tableId,
    collectionId,
    dashboardId,
    metadata,
    parameterValues,
    type = "query",
    name,
    display = "table",
    visualization_settings = {},
    cardType,
    dataset_query = type === "native"
      ? NATIVE_QUERY_TEMPLATE
      : STRUCTURED_QUERY_TEMPLATE,
  }: QuestionCreatorOpts = {}) {
    let card: CardObject = {
      name,
      collection_id: collectionId,
      dashboard_id: dashboardId,
      display,
      visualization_settings,
      dataset_query,
      type: cardType,
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

    // If the card has a top-level entity_id, use that. Otherwise, use the one on the query info.
    // If neither of those exists, synthesize a random one.
    const innerEntityIdPath = ["dataset_query", "info", "card-entity-id"];
    const entity_id =
      card.entity_id || getIn(card, innerEntityIdPath) || Lib.randomIdent();

    // Then set both locations.
    card = chain(card)
      .assoc("entity_id", entity_id)
      .assocIn(innerEntityIdPath, entity_id)
      .value();

    return new Question(card, metadata, parameterValues);
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Question;
