import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { SelectList } from "metabase/common/components/SelectList";
import { Button, Icon, Popover } from "metabase/ui";
import type {
  BinningStrategy,
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
  TemporalBucket,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import { applyProjection } from "../../utils/queries";

import S from "./MetricBucketPicker.module.css";

interface MetricBucketPickerProps {
  definition: MetricDefinition;
  dimension: DimensionMetadata;
  activeDimension?: ProjectionClause;
  isEditing: boolean;
  onSelect: (dimension: ProjectionClause) => void;
}

type BucketItem = {
  displayName: string;
  bucket: TemporalBucket | BinningStrategy | null;
  isDefault?: boolean;
  isSelected?: boolean;
};

export function MetricBucketPicker({
  definition,
  dimension,
  activeDimension,
  isEditing,
  onSelect,
}: MetricBucketPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isTemporalBucketable = LibMetric.isTemporalBucketable(
    definition,
    dimension,
  );
  const isBinnable = LibMetric.isBinnable(definition, dimension);

  const activeBucket = useMemo(() => {
    if (!activeDimension) {
      return null;
    }
    if (isTemporalBucketable) {
      return LibMetric.temporalBucket(activeDimension);
    }
    if (isBinnable) {
      return LibMetric.binning(activeDimension);
    }
    return null;
  }, [activeDimension, isTemporalBucketable, isBinnable]);

  const hasExplicitBucket = activeBucket != null;

  const activeBucketKey = useMemo(() => {
    if (!activeBucket) {
      return null;
    }
    if (isTemporalBucketable) {
      return LibMetric.displayInfo(definition, activeBucket).shortName ?? null;
    }
    if (isBinnable && activeDimension) {
      const tempDef = applyProjection(definition, activeDimension);
      const strategies = LibMetric.availableBinningStrategies(
        tempDef,
        dimension,
      );
      for (const strategy of strategies) {
        const info = LibMetric.displayInfo(tempDef, strategy);
        if (info.selected) {
          return info.displayName;
        }
      }
    }
    return null;
  }, [
    definition,
    activeBucket,
    activeDimension,
    isTemporalBucketable,
    isBinnable,
    dimension,
  ]);

  const items: BucketItem[] = useMemo(() => {
    if (isTemporalBucketable) {
      const buckets = LibMetric.availableTemporalBuckets(definition, dimension);
      return [
        ...buckets.map((bucket) => {
          const info = LibMetric.displayInfo(definition, bucket);
          const isSelected = isEditing
            ? hasExplicitBucket
              ? info.shortName === activeBucketKey
              : (info.default ?? false)
            : false;
          return {
            displayName: info.displayName,
            bucket,
            isDefault: info.default,
            isSelected,
          };
        }),
        {
          displayName: t`Don't bin`,
          bucket: null,
          isSelected: false,
        },
      ];
    }

    if (isBinnable) {
      const strategies = LibMetric.availableBinningStrategies(
        definition,
        dimension,
      );
      return [
        ...strategies.map((strategy) => {
          const info = LibMetric.displayInfo(definition, strategy);
          const isSelected = isEditing
            ? hasExplicitBucket
              ? info.displayName === activeBucketKey
              : (info.default ?? false)
            : false;
          return {
            displayName: info.displayName,
            bucket: strategy,
            isDefault: info.default,
            isSelected,
          };
        }),
        {
          displayName: t`Don't bin`,
          bucket: null,
          isSelected: false,
        },
      ];
    }

    return [];
  }, [
    definition,
    dimension,
    isTemporalBucketable,
    isBinnable,
    hasExplicitBucket,
    activeBucketKey,
    isEditing,
  ]);

  const defaultBucket = useMemo(
    () => items.find((item) => item.isDefault)?.bucket,
    [items],
  );

  const triggerLabel = useMemo(() => {
    if (isEditing && activeBucketKey) {
      if (isTemporalBucketable) {
        const displayBucket = activeBucket ?? defaultBucket;
        if (displayBucket) {
          const info = LibMetric.displayInfo(definition, displayBucket);
          return t`by ${info.displayName.toLowerCase()}`;
        }
      }
      return activeBucketKey;
    }
    if (defaultBucket) {
      const info = LibMetric.displayInfo(definition, defaultBucket);
      if (isTemporalBucketable) {
        return t`by ${info.displayName.toLowerCase()}`;
      }
      return info.displayName;
    }
    return t`Unbinned`;
  }, [
    definition,
    activeBucket,
    activeBucketKey,
    defaultBucket,
    isTemporalBucketable,
    isEditing,
  ]);

  const handlePopoverClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelect = useCallback(
    (item: BucketItem) => {
      const newProjection = isTemporalBucketable
        ? LibMetric.withTemporalBucket(
            dimension,
            item.bucket as TemporalBucket | null,
          )
        : LibMetric.withBinning(
            dimension,
            item.bucket as BinningStrategy | null,
          );

      onSelect(newProjection);
      handlePopoverClose();
    },
    [dimension, isTemporalBucketable, onSelect, handlePopoverClose],
  );

  if (!isTemporalBucketable && !isBinnable) {
    return null;
  }

  return (
    <Popover
      opened={isOpen}
      position="right"
      onClose={handlePopoverClose}
      withinPortal={false}
      onChange={(v) => !v && handlePopoverClose()}
      floatingStrategy="fixed"
    >
      <Popover.Target>
        <Button
          className={S.triggerButton}
          data-bucket-trigger
          data-testid="dimension-list-item-binning"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(!isOpen);
          }}
          px="sm"
          miw="35%"
          maw="50%"
          h="auto"
          py={0}
          variant="subtle"
          color="white"
          classNames={{ label: S.triggerButtonLabel }}
        >
          <Ellipsified>{triggerLabel}</Ellipsified>
          <Icon name="chevronright" className={S.chevronIcon} />
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <SelectList p="sm" miw="10rem">
          {items.map((item) => (
            <SelectList.Item
              key={item.displayName}
              id={item.displayName}
              name={item.displayName}
              isSelected={item.isSelected}
              onSelect={(_, e) => {
                e.stopPropagation();
                handleSelect(item);
              }}
            />
          ))}
        </SelectList>
      </Popover.Dropdown>
    </Popover>
  );
}
