import { useCallback, useMemo } from "react";
import { t } from "ttag";

import type {
  BinningStrategy,
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { applyProjection } from "../../utils/metrics";
import {
  type BucketItem,
  DimensionBucketPicker,
} from "../DimensionBucketPicker";

interface DimensionBinningPickerProps {
  definition: MetricDefinition;
  dimension: DimensionMetadata;
  activeDimension?: ProjectionClause;
  isEditing: boolean;
  onSelect: (dimension: ProjectionClause) => void;
}

export function DimensionBinningPicker({
  definition,
  dimension,
  activeDimension,
  isEditing,
  onSelect,
}: DimensionBinningPickerProps) {
  const activeBucket = useMemo(() => {
    if (!activeDimension) {
      return null;
    }
    return LibMetric.binning(activeDimension);
  }, [activeDimension]);

  const hasExplicitBucket = activeBucket != null;

  const activeBucketKey = useMemo(() => {
    if (!activeBucket || !activeDimension) {
      return null;
    }
    const tempDef = applyProjection(definition, activeDimension);
    const strategies = LibMetric.availableBinningStrategies(tempDef, dimension);
    for (const strategy of strategies) {
      const info = LibMetric.displayInfo(tempDef, strategy);
      if (info.selected) {
        return info.displayName;
      }
    }
    return null;
  }, [definition, activeBucket, activeDimension, dimension]);

  const strategies = useMemo(
    () => LibMetric.availableBinningStrategies(definition, dimension),
    [definition, dimension],
  );

  const items: BucketItem[] = useMemo(
    () => [
      ...strategies.map((strategy) => {
        const info = LibMetric.displayInfo(definition, strategy);
        const isSelected = isEditing
          ? hasExplicitBucket
            ? info.displayName === activeBucketKey
            : (info.default ?? false)
          : false;
        return {
          displayName: info.displayName,
          isDefault: info.default,
          isSelected,
        };
      }),
      {
        displayName: t`Don't bin`,
        isSelected: false,
      },
    ],
    [definition, strategies, hasExplicitBucket, activeBucketKey, isEditing],
  );

  const defaultBucket = useMemo(() => {
    for (let i = 0; i < strategies.length; i++) {
      const info = LibMetric.displayInfo(definition, strategies[i]);
      if (info.default) {
        return strategies[i];
      }
    }
    return null;
  }, [definition, strategies]);

  const triggerLabel = useMemo(() => {
    if (isEditing && activeBucketKey) {
      return activeBucketKey;
    }
    if (defaultBucket) {
      return LibMetric.displayInfo(definition, defaultBucket).displayName;
    }
    return t`Unbinned`;
  }, [definition, activeBucketKey, defaultBucket, isEditing]);

  const handleSelect = useCallback(
    (index: number) => {
      const bucket: BinningStrategy | null =
        index < strategies.length ? strategies[index] : null;
      const newProjection = LibMetric.withBinning(dimension, bucket);
      onSelect(newProjection);
    },
    [dimension, strategies, onSelect],
  );

  return (
    <DimensionBucketPicker
      triggerLabel={triggerLabel}
      items={items}
      onSelect={handleSelect}
    />
  );
}
