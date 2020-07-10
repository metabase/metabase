/* @flow weak */

import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";

import { countLines } from "metabase/lib/string";
import { humanize } from "metabase/lib/formatting";
import Utils from "metabase/lib/utils";

import {
  getEngineNativeAceMode,
  getEngineNativeType,
  getEngineNativeRequiresTable,
} from "metabase/lib/engine";

import { chain, assoc, getIn, assocIn, updateIn } from "icepick";
import _ from "underscore";

import type Question from "metabase-lib/lib/Question";
import type {
  DatasetQuery,
  NativeDatasetQuery,
} from "metabase-types/types/Card";
import type { TemplateTags, TemplateTag } from "metabase-types/types/Query";
import type { DatabaseEngine, DatabaseId } from "metabase-types/types/Database";

import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";

import Dimension, { TemplateTagDimension } from "../Dimension";
import Variable, { TemplateTagVariable } from "../Variable";
import DimensionOptions from "../DimensionOptions";

type DimensionFilter = (dimension: Dimension) => boolean;
type VariableFilter = (variable: Variable) => boolean;

export const NATIVE_QUERY_TEMPLATE: NativeDatasetQuery = {
  database: null,
  type: "native",
  native: {
    query: "",
    "template-tags": {},
  },
};

// This regex needs to match logic in replaceCardId and _getUpdatedTemplateTags.
const CARD_TAG_REGEX = /^#([0-9]*)$/;

function cardTagCardId(name) {
  const match = name.match(CARD_TAG_REGEX);
  if (match && match[1].length > 0) {
    return parseInt(match[1]);
  }
  return null;
}

function isCardQueryName(name) {
  return CARD_TAG_REGEX.test(name);
}

function snippetNameFromTagName(name) {
  return name.slice("snippet:".length).trim();
}

function isSnippetName(name) {
  return name.startsWith("snippet:");
}

export default class NativeQuery extends AtomicQuery {
  // For Flow type completion
  _nativeDatasetQuery: NativeDatasetQuery;

  constructor(
    question: Question,
    datasetQuery: DatasetQuery = NATIVE_QUERY_TEMPLATE,
  ) {
    super(question, datasetQuery);

    this._nativeDatasetQuery = (datasetQuery: NativeDatasetQuery);
  }

  static isDatasetQueryType(datasetQuery: DatasetQuery): boolean {
    return datasetQuery && datasetQuery.type === NATIVE_QUERY_TEMPLATE.type;
  }

  /* Query superclass methods */

  hasData() {
    return (
      this.databaseId() != null && (!this.requiresTable() || this.collection())
    );
  }

  canRun() {
    return (
      this.hasData() &&
      this.queryText().length > 0 &&
      this.allTemplateTagsAreValid()
    );
  }

  isEmpty() {
    return this.databaseId() == null || this.queryText().length === 0;
  }

  clean() {
    return this.setDatasetQuery(
      updateIn(
        this.datasetQuery(),
        ["native", "template-tags"],
        tt => tt || {},
      ),
    );
  }

  /* AtomicQuery superclass methods */

  tables(): ?(Table[]) {
    const database = this.database();
    return (database && database.tables) || null;
  }

  databaseId(): ?DatabaseId {
    // same for both structured and native
    return this._nativeDatasetQuery.database;
  }
  database(): ?Database {
    const databaseId = this.databaseId();
    return databaseId != null ? this._metadata.database(databaseId) : null;
  }
  engine(): ?DatabaseEngine {
    const database = this.database();
    return database && database.engine;
  }

  /**
   * Returns true if the database metadata (or lack thererof indicates the user can modify and run this query
   */
  readOnly(): boolean {
    const database = this.database();
    return !database || database.native_permissions !== "write";
  }

  /* Methods unique to this query type */

  /**
   * @returns a new query with the provided Database set.
   */
  setDatabase(database: Database): NativeQuery {
    return this.setDatabaseId(database.id);
  }
  setDatabaseId(databaseId: DatabaseId): NativeQuery {
    if (databaseId !== this.databaseId()) {
      // TODO: this should reset the rest of the query?
      return new NativeQuery(
        this._originalQuestion,
        assoc(this.datasetQuery(), "database", databaseId),
      );
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

  hasWritePermission(): boolean {
    const database = this.database();
    return database != null && database.native_permissions === "write";
  }

  supportsNativeParameters(): boolean {
    const database = this.database();
    return (
      database != null && _.contains(database.features, "native-parameters")
    );
  }

  table(): ?Table {
    const database = this.database();
    const collection = this.collection();
    if (!database || !collection) {
      return null;
    }
    return _.findWhere(database.tables, { name: collection }) || null;
  }

  queryText(): string {
    return getIn(this.datasetQuery(), ["native", "query"]) || "";
  }

  setQueryText(newQueryText: string): NativeQuery {
    return new NativeQuery(
      this._originalQuestion,
      chain(this._datasetQuery)
        .assocIn(["native", "query"], newQueryText)
        .assocIn(
          ["native", "template-tags"],
          this._getUpdatedTemplateTags(newQueryText),
        )
        .value(),
    );
  }

  collection(): ?string {
    return getIn(this.datasetQuery(), ["native", "collection"]);
  }

  setCollectionName(newCollection: string) {
    return new NativeQuery(
      this._originalQuestion,
      assocIn(this._datasetQuery, ["native", "collection"], newCollection),
    );
  }

  setParameterIndex(id: string, newIndex: number) {
    // NOTE: currently all NativeQuery parameters are implicitly generated from
    // template tags, and the order is determined by the key order
    return new NativeQuery(
      this._originalQuestion,
      updateIn(
        this._datasetQuery,
        ["native", "template_tags"],
        templateTags => {
          const entries = Array.from(Object.entries(templateTags));
          const oldIndex = _.findIndex(entries, entry => entry[1].id === id);
          entries.splice(newIndex, 0, entries.splice(oldIndex, 1)[0]);
          return _.object(entries);
        },
      ),
    );
  }

  lineCount(): number {
    const queryText = this.queryText();
    return queryText ? countLines(queryText) : 0;
  }

  /**
   * The ACE Editor mode name, e.g. 'ace/mode/json'
   */
  aceMode(): string {
    return getEngineNativeAceMode(this.engine());
  }

  /**
   * Name used to describe the text written in that mode, e.g. 'JSON'. Used to fill in the blank in 'This question is written in _______'.
   */
  nativeQueryLanguage() {
    return getEngineNativeType(this.engine()).toUpperCase();
  }

  /**
   * Whether the DB selector should be a DB + Table selector. Mongo needs both DB + Table.
   */
  requiresTable() {
    return getEngineNativeRequiresTable(this.engine());
  }

  // $FlowFixMe
  templateTags(): TemplateTag[] {
    return Object.values(this.templateTagsMap());
  }
  templateTagsWithoutSnippets(): TemplateTag[] {
    return this.templateTags().filter(t => t.type !== "snippet");
  }
  templateTagsMap(): TemplateTags {
    return getIn(this.datasetQuery(), ["native", "template-tags"]) || {};
  }
  allTemplateTagsAreValid(): boolean {
    return this.templateTags().every(
      // field filters require a field
      t => !(t.type === "dimension" && t.dimension == null),
    );
  }

  setTemplateTag(name, tag) {
    return this.setDatasetQuery(
      assocIn(this.datasetQuery(), ["native", "template-tags", name], tag),
    );
  }

  setDatasetQuery(datasetQuery: DatasetQuery): NativeQuery {
    return new NativeQuery(this._originalQuestion, datasetQuery);
  }

  // `replaceCardId` updates the query text to reference a different card.
  // Template tags are updated as a result of calling `setQueryText`.
  replaceCardId(oldId, newId) {
    const re = new RegExp(`{{\\s*#${oldId}\\s*}}`, "g");
    const newQueryText = this.queryText().replace(re, () => `{{#${newId}}}`);
    return this.setQueryText(newQueryText);
  }

  dimensionOptions(
    dimensionFilter: DimensionFilter = () => true,
  ): DimensionOptions {
    const dimensions = this.templateTags()
      .filter(tag => tag.type === "dimension")
      .map(
        tag =>
          new TemplateTagDimension(null, [tag.name], this.metadata(), this),
      )
      .filter(dimensionFilter);
    return new DimensionOptions({
      dimensions: dimensions,
      count: dimensions.length,
    });
  }

  variables(variableFilter: VariableFilter = () => true): Variable[] {
    return this.templateTags()
      .filter(tag => tag.type !== "dimension")
      .map(tag => new TemplateTagVariable([tag.name], this.metadata(), this))
      .filter(variableFilter);
  }

  updateSnippetsWithIds(snippets): NativeQuery {
    const tagsBySnippetName = _.chain(this.templateTags())
      .filter(tag => tag.type === "snippet" && tag["snippet-id"] == null)
      .groupBy(tag => tag["snippet-name"])
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

  updateQueryTextWithNewSnippetNames(snippets): NativeQuery {
    const tagsBySnippetId = _.chain(this.templateTags())
      .filter(tag => tag.type === "snippet")
      .groupBy(tag => tag["snippet-id"])
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
            new RegExp(`\{\{\\s*${tag.name}\\s*\}\}`, "g"),
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

  /**
   * special handling for NATIVE cards to automatically detect parameters ... {{varname}}
   */
  _getUpdatedTemplateTags(queryText: string): TemplateTags {
    if (queryText && this.supportsNativeParameters()) {
      let tags = [];

      // look for variable usage in the query (like '{{varname}}').  we only allow alphanumeric characters for the variable name
      // a variable name can optionally end with :start or :end which is not considered part of the actual variable name
      // expected pattern is like mustache templates, so we are looking for something like {{category}} or {{date:start}}
      // anything that doesn't match our rule is ignored, so {{&foo!}} would simply be ignored
      // variables referencing other questions, by their card ID, are also supported: {{#123}} references question with ID 123
      let match;
      const re = /\{\{\s*((snippet:\s*[^}]+)|[A-Za-z0-9_]+?|#[0-9]*)\s*\}\}/g;
      while ((match = re.exec(queryText)) != null) {
        tags.push(match[1]);
      }

      // eliminate any duplicates since it's allowed for a user to reference the same variable multiple times
      tags = _.uniq(tags);
      const existingTemplateTags = this.templateTagsMap();
      const existingTags = Object.keys(existingTemplateTags);

      // if we ended up with any variables in the query then update the card parameters list accordingly
      if (tags.length > 0 || existingTags.length > 0) {
        const newTags = _.difference(tags, existingTags);
        const oldTags = _.difference(existingTags, tags);

        const templateTags = { ...existingTemplateTags };
        if (oldTags.length === 1 && newTags.length === 1) {
          // renaming
          const newTag = { ...templateTags[oldTags[0]] };

          if (newTag["display-name"] === humanize(oldTags[0])) {
            newTag["display-name"] = humanize(newTags[0]);
          }

          newTag.name = newTags[0];
          if (isCardQueryName(newTag.name)) {
            newTag.type = "card";
            newTag["card-id"] = cardTagCardId(newTag.name);
          } else if (isSnippetName(newTag.name)) {
            newTag.type = "snippet";
            newTag["snippet-name"] = snippetNameFromTagName(newTag.name);
          }
          templateTags[newTag.name] = newTag;
          delete templateTags[oldTags[0]];
        } else {
          // remove old vars
          for (const name of oldTags) {
            delete templateTags[name];
          }

          // create new vars
          for (const tagName of newTags) {
            templateTags[tagName] = {
              id: Utils.uuid(),
              name: tagName,
              "display-name": humanize(tagName),
              type: "text",
            };

            // parse card ID from tag name for card query template tags
            if (isCardQueryName(tagName)) {
              templateTags[tagName] = Object.assign(templateTags[tagName], {
                type: "card",
                "card-id": cardTagCardId(tagName),
              });
            } else if (isSnippetName(tagName)) {
              // extract snippet name from snippet tag
              templateTags[tagName] = Object.assign(templateTags[tagName], {
                type: "snippet",
                "snippet-name": snippetNameFromTagName(tagName),
              });
            }
          }
        }

        // ensure all tags have an id since we need it for parameter values to work
        // $FlowFixMe
        for (const tag: TemplateTag of Object.values(templateTags)) {
          if (tag.id == null) {
            tag.id = Utils.uuid();
          }
        }

        return templateTags;
      }
    }
    return {};
  }
}
