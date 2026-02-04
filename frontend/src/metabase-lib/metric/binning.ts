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
  _metricDefinition: MetricDefinition,
  _source: SourceMetadata,
  _dimension: DimensionMetadata,
): BinningStrategy[] {
  throw new Error("Not implemented");
}

export function isBinnable(
  metricDefinition: MetricDefinition,
  source: SourceMetadata,
  dimension: DimensionMetadata,
): boolean {
  return (
    availableBinningStrategies(metricDefinition, source, dimension).length > 0
  );
}

export function withBinning(
  _dimension: DimensionMetadata,
  _binningStrategy: BinningStrategy | null,
): DimensionMetadata {
  throw new Error("Not implemented");
}

export function withDefaultBinning(
  metricDefinition: MetricDefinition,
  source: SourceMetadata,
  dimension: DimensionMetadata,
): DimensionMetadata {
  const strategies = availableBinningStrategies(
    metricDefinition,
    source,
    dimension,
  );
  const defaultStrategy = strategies.find(
    (strategy) => displayInfo(metricDefinition, strategy).default,
  );
  return defaultStrategy ? withBinning(dimension, defaultStrategy) : dimension;
}
