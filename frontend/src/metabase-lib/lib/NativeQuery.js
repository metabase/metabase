/* @flow weak */

import Query from "./Query";

import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";

import { countLines } from "metabase/lib/string";
import { humanize } from "metabase/lib/formatting";
import Utils from "metabase/lib/utils";

import {
    getEngineNativeAceMode,
    getEngineNativeType,
    getEngineNativeRequiresTable
} from "metabase/lib/engine";

import { chain, getIn, assocIn } from "icepick";
import _ from "underscore";

import type { TemplateTags, TemplateTag } from "metabase/meta/types/Query";

export default class NativeQuery extends Query {
    isNative() {
        return true;
    }

    canRun() {
        return this.databaseId() != null &&
            this.queryText().length > 0 &&
            (!this.requiresTable() || this.collection());
    }

    hasWritePermission(): boolean {
        const database = this.database();
        return database != null && database.native_permissions === "write";
    }

    supportsNativeParameters(): boolean {
        const database = this.database();
        return database != null &&
            _.contains(database.features, "native-parameters");
    }

    databases(): Database[] {
        return super
            .databases()
            .filter(database => database.native_permissions === "write");
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
            this._question,
            this._index,
            chain(this._datasetQuery)
                .assocIn(["native", "query"], newQueryText)
                .assocIn(
                    ["native", "template_tags"],
                    this._getUpdatedTemplateTags(newQueryText)
                )
                .value()
        );
    }

    collection(): ?string {
        return getIn(this.datasetQuery(), ["native", "collection"]);
    }

    updateCollection(newCollection: string) {
        return new NativeQuery(
            this._question,
            this._index,
            assocIn(this._datasetQuery, ["native", "collection"], newCollection)
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
        return getIn(this.datasetQuery(), ["native", "template_tags"]) || {};
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
            let match, re = /\{\{([A-Za-z0-9_]+?)\}\}/g;
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

                    if (
                        templateTags[newTags[0]].display_name ===
                        humanize(oldTags[0])
                    ) {
                        templateTags[newTags[0]].display_name = humanize(
                            newTags[0]
                        );
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
                            type: null
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
