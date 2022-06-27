import Query from "metabase-lib/lib/queries/Query";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { TemplateTag, TemplateTagType } from "metabase-types/types/Query";

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

const VARIABLE_ICONS: Record<TemplateTagType, string | null> = {
  text: "string",
  number: "int",
  date: "calendar",
  dimension: null,
  card: null,
  snippet: null,
};

export class TemplateTagVariable extends Variable {
  tag(): TemplateTag | null | undefined {
    if (this._query instanceof NativeQuery) {
      return this._query.templateTagsMap()[this._args[0]];
    }
  }

  displayName(): string | null | undefined {
    const tag = this.tag();
    return tag && (tag["display-name"] || tag.name);
  }

  icon(): string | null | undefined {
    const tag = this.tag();
    return tag && VARIABLE_ICONS[tag.type];
  }

  mbql() {
    return ["template-tag", this._args[0]];
  }
}
