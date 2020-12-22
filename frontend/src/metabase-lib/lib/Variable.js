/* @flow */

import type Metadata from "./metadata/Metadata";
import type Query from "./queries/Query";
import type { TemplateTag } from "metabase-types/types/Query";

import NativeQuery from "./queries/NativeQuery";

export default class Variable {
  _args: any;
  _metadata: ?Metadata;
  _query: ?Query;

  constructor(args: any[], metadata?: Metadata, query?: Query) {
    this._args = args;
    this._metadata = metadata || (query && query.metadata());
    this._query = query;
  }
}

const VARIABLE_ICONS = {
  text: "string",
  number: "int",
  date: "calendar",
  dimension: null,
};

export class TemplateTagVariable extends Variable {
  tag(): ?TemplateTag {
    if (this._query instanceof NativeQuery) {
      return this._query.templateTagsMap()[this._args[0]];
    }
  }
  displayName() {
    const tag = this.tag();
    return tag && (tag["display-name"] || tag.name);
  }
  icon() {
    const tag = this.tag();
    return tag && VARIABLE_ICONS[tag.type];
  }
  mbql() {
    return ["template-tag", this._args[0]];
  }
}
