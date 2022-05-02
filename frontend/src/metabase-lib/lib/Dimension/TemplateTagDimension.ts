// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { t } from "ttag";
import _ from "underscore";

import { ValidationError, VALIDATION_ERROR_TYPES } from "../ValidationError";
import { TemplateTagVariable } from "../Variable";
import Dimension from "./Dimension";
import FieldDimension from "./FieldDimension";

export default class TemplateTagDimension extends FieldDimension {
  constructor(tagName, metadata, query) {
    super(null, null, metadata, query, {
      _tagName: tagName,
    });
  }

  static parseMBQL(
    mbql,
    metadata = null,
    query = null,
  ): FieldDimension | null | undefined {
    return TemplateTagDimension.isTemplateTagClause(mbql)
      ? Object.freeze(new TemplateTagDimension(mbql[1], metadata, query))
      : null;
  }

  static isTemplateTagClause(clause) {
    return Array.isArray(clause) && clause[0] === "template-tag";
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

  dimension() {
    if (this.isValidDimensionType()) {
      const tag = this.tag();
      return Dimension.parseMBQL(tag.dimension, this._metadata, this._query);
    }

    return null;
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
    if (this.isValidDimensionType()) {
      return this.dimension().field();
    }

    return null;
  }

  name() {
    return this.isValidDimensionType() ? this.field().name : this.tagName();
  }

  tagName() {
    return this._tagName;
  }

  displayName() {
    const tag = this.tag();
    return (tag && tag["display-name"]) || super.displayName();
  }

  mbql() {
    return ["template-tag", this.tagName()];
  }

  icon() {
    if (this.isValidDimensionType()) {
      return this.dimension().icon();
    } else if (this.isVariableType()) {
      return this.variable().icon();
    }

    return "label";
  }
}
