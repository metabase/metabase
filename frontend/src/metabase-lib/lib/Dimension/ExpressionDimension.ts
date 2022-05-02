// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { t } from "ttag";
import { isa } from "cljs/metabase.types";
import { formatBucketing } from "metabase/lib/query_time";
import { infer, MONOTYPE } from "metabase/lib/expressions/typeinferencer";

import Field from "../metadata/Field";
import { Metadata } from "../metadata/Metadata";
import StructuredQuery from "../queries/StructuredQuery";
import Dimension from "./Dimension";

/**
 * Expression reference, `["expression", expression-name]`
 */
export default class ExpressionDimension extends Dimension {
  _expressionName: ExpressionName;

  /**
   * Whether `clause` is an array, and a valid `:expression` clause
   */
  static isExpressionClause(clause): boolean {
    return (
      Array.isArray(clause) && clause.length >= 2 && clause[0] === "expression"
    );
  }

  static parseMBQL(
    mbql: any,
    metadata?: Metadata | null | undefined,
    query?: StructuredQuery | null | undefined,
  ): Dimension | null | undefined {
    if (ExpressionDimension.isExpressionClause(mbql)) {
      const [expressionName, options] = mbql.slice(1);
      return new ExpressionDimension(expressionName, options, metadata, query);
    }
  }

  constructor(
    expressionName,
    options = null,
    metadata = null,
    query = null,
    additionalProperties = null,
  ) {
    super(
      null,
      [expressionName, options],
      metadata,
      query,
      Object.freeze(Dimension.normalizeOptions(options)),
    );
    this._expressionName = expressionName;

    if (additionalProperties) {
      Object.keys(additionalProperties).forEach(k => {
        this[k] = additionalProperties[k];
      });
    }

    Object.freeze(this);
  }

  isEqual(somethingElse) {
    if (isExpressionDimension(somethingElse)) {
      return (
        somethingElse._expressionName === this._expressionName &&
        _.isEqual(somethingElse._options, this._options)
      );
    }

    if (ExpressionDimension.isExpressionClause(somethingElse)) {
      const dimension = ExpressionDimension.parseMBQL(
        somethingElse,
        this._metadata,
        this._query,
      );
      return dimension ? this.isEqual(dimension) : false;
    }

    return false;
  }

  mbql(): ExpressionReference {
    return ["expression", this._expressionName, this._options];
  }

  name() {
    return this._expressionName;
  }

  displayName(): string {
    return this._expressionName;
  }

  columnName() {
    return this._expressionName;
  }

  _createField(fieldInfo): Field {
    return new Field({
      ...fieldInfo,
      metadata: this._metadata,
      query: this._query,
    });
  }

  field() {
    const query = this._query;
    const table = query ? query.table() : null;

    // fallback
    let type = MONOTYPE.Number;
    let semantic_type = null;

    if (query) {
      const datasetQuery = query.query();
      const expressions = datasetQuery?.expressions ?? {};
      const expr = expressions[this.name()];

      const field = mbql => {
        const dimension = Dimension.parseMBQL(
          mbql,
          this._metadata,
          this._query,
        );
        return dimension?.field();
      };

      type = infer(expr, mbql => field(mbql)?.base_type);
      semantic_type = infer(expr, mbql => field(mbql)?.semantic_type);
    } else {
      type = infer(this._expressionName);
    }

    let base_type = type;
    if (!type.startsWith("type/")) {
      switch (type) {
        case MONOTYPE.String:
          base_type = "type/Text";
          break;

        case MONOTYPE.Boolean:
          base_type = "type/Boolean";
          break;

        // fallback
        default:
          base_type = "type/Float";
          break;
      }
      semantic_type = base_type;
    }

    // if a dimension has access to a question with result metadata,
    // we try to find the field using the metadata directly,
    // so that we don't have to try to infer field metadata from the expression
    const resultMetadata = query?.question()?.getResultMetadata?.();
    if (resultMetadata) {
      const fieldMetadata = _.findWhere(resultMetadata, {
        name: this.name(),
      });
      if (fieldMetadata) {
        return this._createField(fieldMetadata);
      }
    }

    const subsOptions = getOptions(semantic_type ? semantic_type : base_type);
    const dimension_options =
      subsOptions && Array.isArray(subsOptions)
        ? subsOptions.map(({ name, options }) => {
            return {
              name,
              type: base_type,
              mbql: ["expression", null, options],
            };
          })
        : null;

    return new Field({
      id: this.mbql(),
      name: this.name(),
      display_name: this.displayName(),
      base_type,
      semantic_type,
      query,
      table,
      dimension_options,
    });
  }

  icon(): IconName {
    const field = this.field();
    return field ? field.icon() : "unknown";
  }

  _dimensionForOption(option): ExpressionDimension {
    const dimension = option.mbql
      ? ExpressionDimension.parseMBQL(option.mbql, this._metadata, this._query)
      : this;

    const additionalProperties = {
      _expressionName: this._expressionName,
    };

    if (option.name) {
      additionalProperties._subDisplayName = option.name;
      additionalProperties._subTriggerDisplayName = option.name;
    }

    return new ExpressionDimension(
      dimension._expressionName,
      dimension._options,
      this._metadata,
      this._query,
      additionalProperties,
    );
  }

  /**
   * Return a copy of this ExpressionDimension that excludes `options`.
   */
  withoutOptions(...options: string[]): ExpressionDimension {
    // optimization: if we don't have any options, we can return ourself as-is
    if (!this._options) {
      return this;
    }

    return new ExpressionDimension(
      this._expressionName,
      _.omit(this._options, ...options),
      this._metadata,
      this._query,
    );
  }

  /**
   * Return a copy of this ExpressionDimension that includes the specified `options`.
   */
  withOptions(options: any): ExpressionDimension {
    // optimization : if options is empty return self as-is
    if (!options || !Object.entries(options).length) {
      return this;
    }

    return new ExpressionDimension(
      this._expressionName,
      { ...this._options, ...options },
      this._metadata,
      this._query,
    );
  }

  render(): string {
    let displayName = this.displayName();

    if (this.temporalUnit()) {
      displayName = `${displayName}: ${formatBucketing(this.temporalUnit())}`;
    }

    if (this.binningOptions()) {
      displayName = `${displayName}: ${this.describeBinning()}`;
    }

    return displayName;
  }
}

const isExpressionDimension = dimension =>
  dimension instanceof ExpressionDimension;

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
