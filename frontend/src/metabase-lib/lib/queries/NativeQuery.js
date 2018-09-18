/* @flow weak */

import Question from "../Question";
import Query from "./Query";

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

import type {
  DatasetQuery,
  NativeDatasetQuery,
} from "metabase/meta/types/Card";
import type { TemplateTags, TemplateTag } from "metabase/meta/types/Query";
import type { DatabaseEngine, DatabaseId } from "metabase/meta/types/Database";
import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";

export const NATIVE_QUERY_TEMPLATE: NativeDatasetQuery = {
  database: null,
  type: "native",
  native: {
    query: "",
    "template-tags": {},
  },
};

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
    return datasetQuery.type === NATIVE_QUERY_TEMPLATE.type;
  }

  /* Query superclass methods */

  canRun() {
    return (
      this.databaseId() != null &&
      this.queryText().length > 0 &&
      (!this.requiresTable() || this.collection())
    );
  }

  isEmpty() {
    return this.databaseId() == null || this.queryText().length == 0;
  }

  databases(): Database[] {
    return super
      .databases()
      .filter(database => database.native_permissions === "write");
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
    return databaseId != null ? this._metadata.databases[databaseId] : null;
  }
  engine(): ?DatabaseEngine {
    const database = this.database();
    return database && database.engine;
  }

  /* Methods unique to this query type */

  /**
   * @returns a new query with the provided Database set.
   */
  setDatabase(database: Database): NativeQuery {
    if (database.id !== this.databaseId()) {
      // TODO: this should reset the rest of the query?
      return new NativeQuery(
        this._originalQuestion,
        assoc(this.datasetQuery(), "database", database.id),
      );
    } else {
      return this;
    }
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

  updateQueryText(newQueryText: string): Query {
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

  updateCollection(newCollection: string) {
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
  templateTagsMap(): TemplateTags {
    return getIn(this.datasetQuery(), ["native", "template-tags"]) || {};
  }

  setDatasetQuery(datasetQuery: DatasetQuery): NativeQuery {
    return new NativeQuery(this._originalQuestion, datasetQuery);
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
      let match,
        re = /\{\{\s*([A-Za-z0-9_]+?)\s*\}\}/g;
      while ((match = re.exec(queryText)) != null) {
        tags.push(match[1]);
      }

      // eliminate any duplicates since it's allowed for a user to reference the same variable multiple times
      const existingTemplateTags = this.templateTagsMap();

      tags = _.uniq(tags);
      let existingTags = Object.keys(existingTemplateTags);

      // if we ended up with any variables in the query then update the card parameters list accordingly
      if (tags.length > 0 || existingTags.length > 0) {
        let newTags = _.difference(tags, existingTags);
        let oldTags = _.difference(existingTags, tags);

        let templateTags = { ...existingTemplateTags };
        if (oldTags.length === 1 && newTags.length === 1) {
          // renaming
          templateTags[newTags[0]] = { ...templateTags[oldTags[0]] };

          if (templateTags[newTags[0]].display_name === humanize(oldTags[0])) {
            templateTags[newTags[0]].display_name = humanize(newTags[0]);
          }

          templateTags[newTags[0]].name = newTags[0];
          delete templateTags[oldTags[0]];
        } else {
          // remove old vars
          for (const name of oldTags) {
            delete templateTags[name];
          }

          // create new vars
          for (let tagName of newTags) {
            templateTags[tagName] = {
              id: Utils.uuid(),
              name: tagName,
              display_name: humanize(tagName),
              type: null,
            };
          }
        }

        // ensure all tags have an id since we need it for parameter values to work
        // $FlowFixMe
        for (const tag: TemplateTag of Object.values(templateTags)) {
          if (tag.id == undefined) {
            tag.id = Utils.uuid();
          }
        }

        return templateTags;
      }
    }
    return {};
  }
}
