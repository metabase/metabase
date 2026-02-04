import { displayInfo } from "./metadata";
import type {
  BinningStrategy,
  Clause,
  DimensionMetadata,
  MetricDefinition,
  SourceMetadata,
} from "./types";

export function binning(
  _clause: Clause | DimensionMetadata,
): BinningStrategy | null {
  throw new Error("Not implemented");
}

export function availableBinningStrategies(
  _definition: MetricDefinition,
  _source: SourceMetadata,
  _dimension: DimensionMetadata,
): BinningStrategy[] {
  throw new Error("Not implemented");
}

export function isBinnable(
  definition: MetricDefinition,
  source: SourceMetadata,
  dimension: DimensionMetadata,
): boolean {
  return availableBinningStrategies(definition, source, dimension).length > 0;
}

export function withBinning(
  _dimension: DimensionMetadata,
  _binningStrategy: BinningStrategy | null,
): DimensionMetadata {
  throw new Error("Not implemented");
}

export function withDefaultBinning(
  definition: MetricDefinition,
  source: SourceMetadata,
  dimension: DimensionMetadata,
): DimensionMetadata {
  const strategies = availableBinningStrategies(definition, source, dimension);
  const defaultStrategy = strategies.find(
    (strategy) => displayInfo(definition, strategy).default,
  );
  return defaultStrategy ? withBinning(dimension, defaultStrategy) : dimension;
}
