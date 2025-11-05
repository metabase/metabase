import { t } from "ttag";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/v1/ValidationError";
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

  validateTemplateTag(): ValidationError | null {
    const tag = this.tag();
    if (!tag) {
      return new ValidationError(t`Invalid template tag "${this.tagName()}"`);
    }

    if (this.isDimensionType() && tag.dimension == null) {
      return new ValidationError(
        t`The variable "${this.tagName()}" needs to be mapped to a field.`,
        VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
      );
    }

    return null;
  }

  isValidDimensionType() {
    const maybeErrors = this.validateTemplateTag();
    return this.isDimensionType() && maybeErrors === null;
  }

  isDimensionType() {
    const maybeTag = this.tag();
    return maybeTag?.type === "dimension";
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

  name() {
    return this.isValidDimensionType()
      ? (this.field()?.name ?? "")
      : this.tagName();
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
