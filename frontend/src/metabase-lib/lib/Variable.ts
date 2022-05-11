// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Metadata from "metabase-lib/lib/metadata/Metadata";
import Query from "metabase-lib/lib/queries/Query";
import { TemplateTag } from "metabase-types/types/Query";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
export default class Variable {
  _args: any;
  _metadata: Metadata | null | undefined;
  _query: Query | null | undefined;

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
  tag(): TemplateTag | null | undefined {
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
