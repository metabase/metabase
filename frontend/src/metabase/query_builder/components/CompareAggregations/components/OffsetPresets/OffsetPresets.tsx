import { t } from "ttag";
import _ from "underscore";

import { Button, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

type Preset = {
  bucket: Lib.Bucket;
  displayName: string;
  shortName: TemporalUnit;
  isCurrent: boolean;
};

type Props = {
  query: Lib.Query;
  stageIndex: number;
  bucket: TemporalUnit | null;
  column: Lib.ColumnMetadata;
  onBucketChange: (bucket: TemporalUnit | null) => void;
  onShowOffsetInput: () => void;
};

const PREFERRED_PRESET_UNITS = ["month", "year", "quarter", "week"];
const MAX_NUMBER_OF_PRESETS = 2;

export function OffsetPresets({
  query,
  stageIndex,
  bucket,
  onBucketChange,
  column,
  onShowOffsetInput,
}: Props) {
  const presets = getPreferredPresets(query, stageIndex, column, bucket);

  return (
    <Flex align="flex-end" pos="relative" gap="sm">
      {presets.map(preset => (
        <Button
          key={preset.shortName}
          variant={preset.shortName === bucket ? "filled" : "default"}
          radius="xl"
          p="sm"
          onClick={() => onBucketChange(preset.shortName)}
        >
          {preset.displayName}
        </Button>
      ))}

      <Button variant="default" radius="xl" p="sm" onClick={onShowOffsetInput}>
        {t`Custom...`}
      </Button>
    </Flex>
  );
}

function getPreferredPresets(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  currentBucket: TemporalUnit | null,
) {
  const availableBuckets = Lib.availableTemporalBuckets(
    query,
    stageIndex,
    column,
  );

  const availablePresets = availableBuckets
    .map(availableBucket => {
      const info = Lib.displayInfo(query, stageIndex, availableBucket);
      if (info.isTemporalExtraction) {
        return null;
      }

      return {
        bucket: availableBucket,
        shortName: info.shortName,
        displayName: t`Previous ${info.displayName.toLowerCase()}`,
        isCurrent: info.shortName === currentBucket,
      };
    })
    .filter((preset): preset is Preset => preset !== null);

  const sortedPresets = _.sortBy(availablePresets, availablePreset => {
    const index = PREFERRED_PRESET_UNITS.indexOf(availablePreset.shortName);

    if (availablePreset.isCurrent) {
      if (index < MAX_NUMBER_OF_PRESETS) {
        return index;
      } else {
        return -Infinity;
      }
    }

    if (index === -1) {
      return Infinity;
    }

    return index;
  });

  return sortedPresets.slice(0, MAX_NUMBER_OF_PRESETS);
}
