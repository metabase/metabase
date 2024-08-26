import NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import Variable from "metabase-lib/v1/variables/Variable";
import type { TemplateTag, VariableTarget } from "metabase-types/api";

import { VARIABLE_ICONS } from "./constants";

// eslint-disable-next-line import/no-default-export -- deprecated usage
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

  mbql(): VariableTarget {
    return ["template-tag", this._args[0]];
  }
}
