import type {
  BooleanFilterParts,
  CoordinateFilterParts,
  DefaultFilterParts,
  DimensionMetadata,
  ExcludeDateFilterParts,
  FilterClause,
  MetricDefinition,
  NumberFilterParts,
  RelativeDateFilterParts,
  SpecificDateFilterParts,
  StringFilterParts,
  TimeFilterParts,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

// ── Dimension filter value (serializable, dimension-free) ──

export type DimensionFilterValue =
  | {
      type: "string";
      operator: StringFilterParts["operator"];
      values: string[];
      options: StringFilterParts["options"];
    }
  | {
      type: "boolean";
      operator: BooleanFilterParts["operator"];
      values: boolean[];
    }
  | {
      type: "number";
      operator: NumberFilterParts["operator"];
      values: NumberFilterParts["values"];
    }
  | {
      type: "coordinate";
      operator: CoordinateFilterParts["operator"];
      values: CoordinateFilterParts["values"];
    }
  | {
      type: "specific-date";
      operator: SpecificDateFilterParts["operator"];
      values: Date[];
      hasTime: boolean;
    }
  | {
      type: "relative-date";
      unit: RelativeDateFilterParts["unit"];
      value: number;
      offsetUnit: RelativeDateFilterParts["offsetUnit"];
      offsetValue: RelativeDateFilterParts["offsetValue"];
      options: RelativeDateFilterParts["options"];
    }
  | {
      type: "exclude-date";
      operator: ExcludeDateFilterParts["operator"];
      unit: ExcludeDateFilterParts["unit"];
      values: number[];
    }
  | { type: "time"; operator: TimeFilterParts["operator"]; values: Date[] }
  | { type: "default"; operator: DefaultFilterParts["operator"] };

type ParsedFilter = {
  dimension: DimensionMetadata;
  value: DimensionFilterValue;
};

export function parseFilter(
  definition: MetricDefinition,
  filterClause: FilterClause,
): ParsedFilter | null {
  const stringParts = LibMetric.stringFilterParts(definition, filterClause);
  if (stringParts) {
    return {
      dimension: stringParts.dimension,
      value: {
        type: "string",
        operator: stringParts.operator,
        values: stringParts.values,
        options: stringParts.options,
      },
    };
  }

  const booleanParts = LibMetric.booleanFilterParts(definition, filterClause);
  if (booleanParts) {
    return {
      dimension: booleanParts.dimension,
      value: {
        type: "boolean",
        operator: booleanParts.operator,
        values: booleanParts.values,
      },
    };
  }

  const numberParts = LibMetric.numberFilterParts(definition, filterClause);
  if (numberParts) {
    return {
      dimension: numberParts.dimension,
      value: {
        type: "number",
        operator: numberParts.operator,
        values: numberParts.values,
      },
    };
  }

  const coordParts = LibMetric.coordinateFilterParts(definition, filterClause);
  if (coordParts) {
    return {
      dimension: coordParts.dimension,
      value: {
        type: "coordinate",
        operator: coordParts.operator,
        values: coordParts.values,
      },
    };
  }

  const specificParts = LibMetric.specificDateFilterParts(
    definition,
    filterClause,
  );
  if (specificParts) {
    return {
      dimension: specificParts.dimension,
      value: {
        type: "specific-date",
        operator: specificParts.operator,
        values: specificParts.values,
        hasTime: specificParts.hasTime,
      },
    };
  }

  const relativeParts = LibMetric.relativeDateFilterParts(
    definition,
    filterClause,
  );
  if (relativeParts) {
    return {
      dimension: relativeParts.dimension,
      value: {
        type: "relative-date",
        unit: relativeParts.unit,
        value: relativeParts.value,
        offsetUnit: relativeParts.offsetUnit,
        offsetValue: relativeParts.offsetValue,
        options: relativeParts.options,
      },
    };
  }

  const excludeParts = LibMetric.excludeDateFilterParts(
    definition,
    filterClause,
  );
  if (excludeParts) {
    return {
      dimension: excludeParts.dimension,
      value: {
        type: "exclude-date",
        operator: excludeParts.operator,
        unit: excludeParts.unit,
        values: excludeParts.values,
      },
    };
  }

  const timeParts = LibMetric.timeFilterParts(definition, filterClause);
  if (timeParts) {
    return {
      dimension: timeParts.dimension,
      value: {
        type: "time",
        operator: timeParts.operator,
        values: timeParts.values,
      },
    };
  }

  const defaultParts = LibMetric.defaultFilterParts(definition, filterClause);
  if (defaultParts) {
    return {
      dimension: defaultParts.dimension,
      value: {
        type: "default",
        operator: defaultParts.operator,
      },
    };
  }

  return null;
}

export function buildDimensionFilterClause(
  dimension: DimensionMetadata,
  filterValue: DimensionFilterValue,
): FilterClause {
  switch (filterValue.type) {
    case "string":
      return LibMetric.stringFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
        options: filterValue.options,
      });
    case "boolean":
      return LibMetric.booleanFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
      });
    case "number":
      return LibMetric.numberFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
      });
    case "coordinate":
      return LibMetric.coordinateFilterClause({
        operator: filterValue.operator,
        dimension,
        longitudeDimension: null,
        values: filterValue.values,
      });
    case "specific-date":
      return LibMetric.specificDateFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
        hasTime: filterValue.hasTime,
      });
    case "relative-date":
      return LibMetric.relativeDateFilterClause({
        dimension,
        unit: filterValue.unit,
        value: filterValue.value,
        offsetUnit: filterValue.offsetUnit,
        offsetValue: filterValue.offsetValue,
        options: filterValue.options,
      });
    case "exclude-date":
      return LibMetric.excludeDateFilterClause({
        operator: filterValue.operator,
        unit: filterValue.unit,
        dimension,
        values: filterValue.values,
      });
    case "time":
      return LibMetric.timeFilterClause({
        operator: filterValue.operator,
        dimension,
        values: filterValue.values,
      });
    case "default":
      return LibMetric.defaultFilterClause({
        operator: filterValue.operator,
        dimension,
      });
  }
}

// ── Serialized source filter ──

export type SourceFilter = {
  dimensionId: string;
  value: DimensionFilterValue;
};

export function extractDefinitionFilters(
  definition: MetricDefinition,
): SourceFilter[] {
  const filters = LibMetric.filters(definition);
  const result: SourceFilter[] = [];

  for (const clause of filters) {
    const parsed = parseFilter(definition, clause);
    if (!parsed) {
      continue;
    }
    const dimInfo = LibMetric.dimensionValuesInfo(definition, parsed.dimension);
    result.push({ dimensionId: dimInfo.id, value: parsed.value });
  }

  return result;
}
