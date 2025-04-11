// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { updateIn } from "icepick";
import slugg from "slugg";
import { t } from "ttag";
import _ from "underscore";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import ValidationError from "metabase-lib/v1/ValidationError";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import { getTemplateTagParameter } from "metabase-lib/v1/parameters/utils/template-tags";
import TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import type Variable from "metabase-lib/v1/variables/Variable";
import type {
  Card,
  DatabaseId,
  DatasetQuery,
  NativeDatasetQuery,
  ParameterValuesConfig,
  TemplateTag,
  TemplateTags,
} from "metabase-types/api";

import { TemplateTagDimension } from "../Dimension";
import DimensionOptions from "../DimensionOptions";

import { getNativeQueryTable } from "./utils/native-query-table";

type DimensionFilter = (dimension: TemplateTagDimension) => boolean;
type VariableFilter = (variable: Variable) => boolean;
export const NATIVE_QUERY_TEMPLATE: NativeDatasetQuery = {
  database: null,
  type: "native",
  native: {
    query: "",
    "template-tags": {},
  },
};

///////////////////////////
// QUERY TEXT TAG UTILS

function tagRegex(tagName: string): RegExp {
  return new RegExp(`{{\\s*${tagName}\\s*}}`, "g");
}

function replaceTagName(
  query: NativeQuery,
  oldTagName: string,
  newTagName: string,
): NativeQuery {
  const queryText = query
    .queryText()
    .replace(tagRegex(oldTagName), `{{${newTagName}}}`);
  return query.setQueryText(queryText);
}

export function updateCardTemplateTagNames(
  query: NativeQuery,
  cards: Card[],
): NativeQuery {
  const cardById = _.indexBy(cards, "id");
  const tags = query
    .templateTags()
    // only tags for cards
    .filter((tag) => tag.type === "card")
    // only tags for given cards
    .filter((tag) => cardById[tag["card-id"]]);
  // reduce over each tag, updating query text with the new tag name
  return tags.reduce((query, tag) => {
    const card = cardById[tag["card-id"]];
    const newTagName = `#${card.id}-${slugg(card.name)}`;
    return replaceTagName(query, tag.name, newTagName);
  }, query);
}

// QUERY TEXT TAG UTILS END
///////////////////////////

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class NativeQuery {
  _question: Question;
  _datasetQuery: DatasetQuery;

  constructor(
    question: Question,
    datasetQuery: DatasetQuery = NATIVE_QUERY_TEMPLATE,
  ) {
    this._question = question;
    this._datasetQuery = datasetQuery;
  }

  static isDatasetQueryType(datasetQuery: DatasetQuery) {
    return datasetQuery?.type === NATIVE_QUERY_TEMPLATE.type;
  }

  private _query(): Lib.Query {
    return this.question().query();
  }

  private _setQuery(query: Lib.Query): NativeQuery {
    return this.question().setQuery(query).legacyNativeQuery();
  }

  /**
   * Returns a question updated with the current dataset query.
   * Can only be applied to query that is a direct child of the question.
   */
  question = _.once((): Question => {
    return this._question.setLegacyQuery(this);
  });

  /**
   * Convenience method for accessing the global metadata
   */
  metadata() {
    return this._question.metadata();
  }

  /**
   * Returns the dataset_query object underlying this Query
   */
  datasetQuery(): DatasetQuery {
    return this._datasetQuery;
  }

  /* Query superclass methods */

  hasData() {
    return (
      this._databaseId() != null && (!this.requiresTable() || this.collection())
    );
  }

  canRun() {
    return Boolean(
      this.hasData() &&
        this.queryText().length > 0 &&
        this._allTemplateTagsAreValid(),
    );
  }

  isEmpty() {
    return this._databaseId() == null || this.queryText().length === 0;
  }

  tables(): Table[] | null | undefined {
    const database = this._database();
    return (database && database.tables) || null;
  }

  _databaseId(): DatabaseId | null | undefined {
    return Lib.databaseID(this._query());
  }

  _database(): Database | null | undefined {
    const databaseId = this._databaseId();
    return databaseId != null ? this.metadata().database(databaseId) : null;
  }

  engine(): string | null | undefined {
    return Lib.engine(this._query());
  }

  /* Methods unique to this query type */

  setDatabaseId(databaseId: DatabaseId): NativeQuery {
    if (databaseId !== this._databaseId()) {
      const metadataProvider = Lib.metadataProvider(
        databaseId,
        this.metadata(),
      );
      const newQuery = Lib.withDifferentDatabase(
        this._query(),
        databaseId,
        metadataProvider,
      );
      return this._setQuery(newQuery);
    } else {
      return this;
    }
  }

  setDefaultCollection(): NativeQuery {
    if (this.requiresTable()) {
      const tables = this.tables();

      if (tables && tables.length > 0) {
        return this.setCollectionName(tables[0].name);
      }
    }

    return this;
  }

  hasWritePermission() {
    const database = this._database();
    return database != null && database.native_permissions === "write";
  }

  supportsNativeParameters() {
    const database = this._database();
    return (
      database != null && _.contains(database.features, "native-parameters")
    );
  }

  table(): Table | null {
    return getNativeQueryTable(this);
  }

  queryText(): string {
    return Lib.rawNativeQuery(this._query()) ?? "";
  }

  setQueryText(newQueryText: string): NativeQuery {
    const newQuery = Lib.withNativeQuery(this._query(), newQueryText);
    return this._setQuery(newQuery);
  }

  collection(): string | null | undefined {
    const extras = Lib.nativeExtras(this._query());
    return extras?.collection;
  }

  setCollectionName(newCollection: string) {
    const newQuery = Lib.withNativeExtras(this._query(), {
      collection: newCollection,
    });
    return this._setQuery(newQuery);
  }

  setParameterIndex(id: string, newIndex: number) {
    // NOTE: currently all NativeQuery parameters are implicitly generated from
    // template tags, and the order is determined by the key order
    // NOTE 2: currently cannot be ported to MBQL lib because maps with keys in
    // different order are considered equal.
    return new NativeQuery(
      this._originalQuestion,
      updateIn(
        this._datasetQuery,
        ["native", "template-tags"],
        (templateTags) => {
          const entries = Array.from(Object.entries(templateTags));

          const oldIndex = _.findIndex(entries, (entry) => entry[1].id === id);

          entries.splice(newIndex, 0, entries.splice(oldIndex, 1)[0]);
          return _.object(entries);
        },
      ),
    );
  }

  lineCount(): number {
    const queryText = this.queryText();
    return queryText ? queryText.split(/\n/g).length : 0;
  }

  /**
   * Whether the DB selector should be a DB + Table selector. Mongo needs both DB + Table.
   */
  requiresTable() {
    return this.engine() === "mongo";
  }

  templateTagsMap(): TemplateTags {
    return Lib.templateTags(this._query());
  }

  templateTags(): TemplateTag[] {
    return Object.values(this.templateTagsMap());
  }

  variableTemplateTags(): TemplateTag[] {
    return this.templateTags().filter((t) =>
      ["dimension", "text", "number", "date"].includes(t.type),
    );
  }

  hasVariableTemplateTags(): boolean {
    return this.variableTemplateTags().length > 0;
  }

  hasSnippets() {
    return this.templateTags().some((t) => t.type === "snippet");
  }

  referencedQuestionIds(): number[] {
    return this.templateTags()
      .filter((tag) => tag.type === "card")
      .map((tag) => tag["card-id"]);
  }

  private _validateTemplateTags() {
    return this.templateTags()
      .map((tag) => {
        if (!tag["display-name"]) {
          return new ValidationError(t`Missing widget label: ${tag.name}`);
        }
        const dimension = new TemplateTagDimension(
          tag.name,
          this.metadata(),
          this,
        );
        if (!dimension) {
          return new ValidationError(t`Invalid template tag: ${tag.name}`);
        }

        return dimension.validateTemplateTag();
      })
      .filter(
        (maybeError): maybeError is ValidationError => maybeError != null,
      );
  }

  private _allTemplateTagsAreValid() {
    const tagErrors = this._validateTemplateTags();
    return tagErrors.length === 0;
  }

  setTemplateTag(name: string, tag: TemplateTag): NativeQuery {
    const query = this._query();
    const tags = Lib.templateTags(query);
    const newQuery = Lib.withTemplateTags(query, { ...tags, [name]: tag });
    return this._setQuery(newQuery);
  }

  setTemplateTagConfig(
    tag: TemplateTag,
    config: ParameterValuesConfig,
  ): NativeQuery {
    const newParameter = getTemplateTagParameter(tag, config);
    return this.question()
      .setParameter(tag.id, newParameter)
      .legacyNativeQuery();
  }

  setDatasetQuery(datasetQuery: DatasetQuery): NativeQuery {
    return this.question().setDatasetQuery(datasetQuery).legacyNativeQuery();
  }

  dimensionOptions(
    dimensionFilter: DimensionFilter = _.identity,
    operatorFilter = _.identity,
  ): DimensionOptions {
    const dimensions = this.templateTags()
      .filter((tag) => tag.type === "dimension" && operatorFilter(tag))
      .map((tag) => new TemplateTagDimension(tag.name, this.metadata(), this))
      .filter((dimension) => dimensionFilter(dimension));
    return new DimensionOptions({
      dimensions: dimensions,
      count: dimensions.length,
    });
  }

  variables(
    variableFilter: VariableFilter = () => true,
  ): TemplateTagVariable[] {
    return this.templateTags()
      .filter((tag) => tag.type !== "dimension")
      .map((tag) => new TemplateTagVariable([tag.name], this.metadata(), this))
      .filter(variableFilter);
  }

  updateSnippetsWithIds(snippets): NativeQuery {
    const tagsBySnippetName = _.chain(this.templateTags())
      .filter((tag) => tag.type === "snippet" && tag["snippet-id"] == null)
      .groupBy((tag) => tag["snippet-name"])
      .value();

    if (Object.keys(tagsBySnippetName).length === 0) {
      // no need to check if there are no tags
      return this;
    }

    let query = this;

    for (const snippet of snippets) {
      for (const tag of tagsBySnippetName[snippet.name] || []) {
        query = query.setTemplateTag(tag.name, {
          ...tag,
          "snippet-id": snippet.id,
        });
      }
    }

    return query;
  }

  updateSnippetNames(snippets): NativeQuery {
    const tagsBySnippetId = _.chain(this.templateTags())
      .filter((tag) => tag.type === "snippet")
      .groupBy((tag) => tag["snippet-id"])
      .value();

    if (Object.keys(tagsBySnippetId).length === 0) {
      // no need to check if there are no tags
      return this;
    }

    let queryText = this.queryText();

    for (const snippet of snippets) {
      for (const tag of tagsBySnippetId[snippet.id] || []) {
        if (tag["snippet-name"] !== snippet.name) {
          queryText = queryText.replace(
            tagRegex(tag.name),
            `{{snippet: ${snippet.name}}}`,
          );
        }
      }
    }

    if (queryText !== this.queryText()) {
      return this.setQueryText(queryText).updateSnippetsWithIds(snippets);
    }

    return this;
  }
}
