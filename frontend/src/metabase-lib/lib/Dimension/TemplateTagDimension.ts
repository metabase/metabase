// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { t } from "ttag";
import _ from "underscore";

import { isa } from "cljs/metabase.types";

import { ValidationError, VALIDATION_ERROR_TYPES } from "../ValidationError";
import { TemplateTagVariable } from "../Variable";
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
const DIMENSION_TYPES: typeof Dimension[] = [
  FieldDimension,
  ExpressionDimension,
  AggregationDimension,
  TemplateTagDimension,
];

const NUMBER_SUBDIMENSIONS = [
  {
    name: t`Auto bin`,
    options: {
      binning: {
        strategy: "default",
      },
    },
  },
  {
    name: t`10 bins`,
    options: {
      binning: {
        strategy: "num-bins",
        "num-bins": 10,
      },
    },
  },
  {
    name: t`50 bins`,
    options: {
      binning: {
        strategy: "num-bins",
        "num-bins": 50,
      },
    },
  },
  {
    name: t`100 bins`,
    options: {
      binning: {
        strategy: "num-bins",
        "num-bins": 100,
      },
    },
  },
  {
    name: t`Don't bin`,
    options: null,
  },
];

const DATETIME_SUBDIMENSIONS = [
  {
    name: t`Minute`,
    options: {
      "temporal-unit": "minute",
    },
  },
  {
    name: t`Hour`,
    options: {
      "temporal-unit": "hour",
    },
  },
  {
    name: t`Day`,
    options: {
      "temporal-unit": "day",
    },
  },
  {
    name: t`Week`,
    options: {
      "temporal-unit": "week",
    },
  },
  {
    name: t`Month`,
    options: {
      "temporal-unit": "month",
    },
  },
  {
    name: t`Quarter`,
    options: {
      "temporal-unit": "quarter",
    },
  },
  {
    name: t`Year`,
    options: {
      "temporal-unit": "year",
    },
  },
  {
    name: t`Minute of Hour`,
    options: {
      "temporal-unit": "minute-of-hour",
    },
  },
  {
    name: t`Hour of Day`,
    options: {
      "temporal-unit": "hour-of-day",
    },
  },
  {
    name: t`Day of Week`,
    options: {
      "temporal-unit": "day-of-week",
    },
  },
  {
    name: t`Day of Month`,
    options: {
      "temporal-unit": "day-of-month",
    },
  },
  {
    name: t`Day of Year`,
    options: {
      "temporal-unit": "day-of-year",
    },
  },
  {
    name: t`Week of Year`,
    options: {
      "temporal-unit": "week-of-year",
    },
  },
  {
    name: t`Month of Year`,
    options: {
      "temporal-unit": "month-of-year",
    },
  },
  {
    name: t`Quarter of Year`,
    options: {
      "temporal-unit": "quarter-of-year",
    },
  },
];

const COORDINATE_SUBDIMENSIONS = [
  {
    name: t`Bin every 0.1 degrees`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 0.1,
      },
    },
  },
  {
    name: t`Bin every 1 degree`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 1,
      },
    },
  },
  {
    name: t`Bin every 10 degrees`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 10,
      },
    },
  },
  {
    name: t`Bin every 20 degrees`,
    options: {
      binning: {
        strategy: "bin-width",
        "bin-width": 20,
      },
    },
  },
  {
    name: t`Don't bin`,
    options: null,
  },
];

function getOptions(type) {
  if (isa(type, "type/Coordinate")) {
    return COORDINATE_SUBDIMENSIONS;
  } else if (isa(type, "type/Number")) {
    return NUMBER_SUBDIMENSIONS;
  } else if (isa(type, "type/DateTime")) {
    return DATETIME_SUBDIMENSIONS;
  }

  return null;
}
