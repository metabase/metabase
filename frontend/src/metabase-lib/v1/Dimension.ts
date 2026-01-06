import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import type { VariableTarget } from "metabase-types/api";

export class TemplateTagDimension {
  private readonly _query: NativeQuery;
  private readonly _metadata: Metadata;
  private readonly _tagName: string;

  constructor(tagName: string, metadata: Metadata, query: NativeQuery) {
    this._query = query;
    this._metadata = metadata;
    this._tagName = tagName;
  }

  isVariableType() {
    const maybeTag = this.tag();
    return ["text", "number", "date"].includes(maybeTag?.type);
  }

  variable() {
    if (this.isVariableType()) {
      const tag = this.tag();
      return new TemplateTagVariable([tag.name], this._metadata, this._query);
    }

    return null;
  }

  tag() {
    const templateTagMap = this._query?.templateTagsMap() ?? {};
    return templateTagMap[this.tagName()];
  }

  field() {
    try {
      const tag = this.tag();
      if (tag != null && tag.type === "dimension" && tag.dimension != null) {
        const fieldId = tag.dimension[1];
        return this._metadata.field(fieldId);
      }
      return null;
    } catch (e) {
      console.warn("TemplateTagDimension.field()", this.mbql(), e);
      return null;
    }
  }

  icon() {
    return this.field()?.icon();
  }

  tagName() {
    return this._tagName;
  }

  displayName() {
    return this.tag()?.["display-name"] ?? this.field()?.displayName() ?? "";
  }

  mbql(): VariableTarget {
    return ["template-tag", this.tagName()];
  }
}
