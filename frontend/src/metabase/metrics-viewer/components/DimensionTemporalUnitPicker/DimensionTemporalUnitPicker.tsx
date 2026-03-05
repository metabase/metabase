import { useCallback, useMemo } from "react";
import { t } from "ttag";

import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
  TemporalBucket,
  TemporalBucketDisplayInfo,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import {
  type BucketItem,
  DimensionBucketPicker,
} from "../DimensionBucketPicker";

interface DimensionTemporalUnitPickerProps {
  definition: MetricDefinition;
  dimension: DimensionMetadata;
  activeDimension?: ProjectionClause;
  isEditing: boolean;
  onSelect: (dimension: ProjectionClause) => void;
}

function isBucketSelected(
  info: TemporalBucketDisplayInfo,
  isEditing: boolean,
  hasExplicitBucket: boolean,
  activeBucketKey: string | null,
): boolean {
  if (!isEditing) {
    return false;
  }
  if (hasExplicitBucket) {
    return info.shortName === activeBucketKey;
  }
  return info.default ?? false;
}

export function DimensionTemporalUnitPicker({
  definition,
  dimension,
  activeDimension,
  isEditing,
  onSelect,
}: DimensionTemporalUnitPickerProps) {
  const activeBucket = useMemo(() => {
    if (!activeDimension) {
      return null;
    }
    return LibMetric.temporalBucket(activeDimension);
  }, [activeDimension]);

  const hasExplicitBucket = activeBucket != null;

  const activeBucketKey = useMemo(() => {
    if (!activeBucket) {
      return null;
    }
    return LibMetric.displayInfo(definition, activeBucket).shortName ?? null;
  }, [definition, activeBucket]);

  const buckets = useMemo(
    () => LibMetric.availableTemporalBuckets(definition, dimension),
    [definition, dimension],
  );

  const items: BucketItem[] = useMemo(
    () => [
      ...buckets.map((bucket) => {
        const info = LibMetric.displayInfo(definition, bucket);
        return {
          displayName: info.displayName,
          isDefault: info.default,
          isSelected: isBucketSelected(
            info,
            isEditing,
            hasExplicitBucket,
            activeBucketKey,
          ),
        };
      }),
      {
        displayName: t`Don't bin`,
        isSelected: false,
      },
    ],
    [definition, buckets, hasExplicitBucket, activeBucketKey, isEditing],
  );

  const defaultBucket = useMemo(
    () =>
      buckets.find(
        (bucket) => LibMetric.displayInfo(definition, bucket).default,
      ) ?? null,
    [definition, buckets],
  );

  const triggerLabel = useMemo(() => {
    if (isEditing && activeBucketKey) {
      const displayBucket = activeBucket ?? defaultBucket;
      if (displayBucket) {
        const info = LibMetric.displayInfo(definition, displayBucket);
        return t`by ${info.displayName.toLowerCase()}`;
      }
    }
    if (defaultBucket) {
      const info = LibMetric.displayInfo(definition, defaultBucket);
      return t`by ${info.displayName.toLowerCase()}`;
    }
    return t`Unbinned`;
  }, [definition, activeBucket, activeBucketKey, defaultBucket, isEditing]);

  const handleSelect = useCallback(
    (index: number) => {
      const bucket: TemporalBucket | null =
        index < buckets.length ? buckets[index] : null;
      const newProjection = LibMetric.withTemporalBucket(dimension, bucket);
      onSelect(newProjection);
    },
    [dimension, buckets, onSelect],
  );

  return (
    <DimensionBucketPicker
      triggerLabel={triggerLabel}
      items={items}
      onSelect={handleSelect}
    />
  );
}
