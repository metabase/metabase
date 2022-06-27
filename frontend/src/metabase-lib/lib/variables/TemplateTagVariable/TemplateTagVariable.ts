import { TemplateTagType, TemplateTag } from "metabase-types/types/Query";
import Variable from "metabase-lib/lib/variables/Variable";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

const VARIABLE_ICONS: Record<TemplateTagType, string | null> = {
  text: "string",
  number: "int",
  date: "calendar",
  dimension: null,
  card: null,
  snippet: null,
};

export default class TemplateTagVariable extends Variable {
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
