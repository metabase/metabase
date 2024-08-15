import { t } from "ttag";

import { Flex, Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

type Preset = {
  bucket: Lib.Bucket;
  displayName: string;
  shortName: TemporalUnit;
};

type Props = {
  query: Lib.Query;
  stageIndex: number;
  bucket: TemporalUnit | null;
  column: Lib.ColumnMetadata;
  onBucketChange: (bucket: TemporalUnit | null) => void;
  onShowOffsetInput: () => void;
};

const PREFERRED_PRESETS = ["month", "year", "quarter", "week"];

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
  bucket: TemporalUnit | null,
) {
  const availabeBuckets = Lib.availableTemporalBuckets(
    query,
    stageIndex,
    column,
  );

  const byKey: Record<string, Preset> = {};
  for (const availableBucket of availabeBuckets) {
    const info = Lib.displayInfo(query, stageIndex, availableBucket);
    byKey[info.shortName] = {
      bucket: availableBucket,
      shortName: info.shortName,
      displayName: t`Previous ${info.displayName.toLowerCase()}`,
    };
  }

  let hasOriginalBucket = false;
  const res = [];
  for (const key of PREFERRED_PRESETS) {
    if (res.length >= 2) {
      break;
    }
    if (key in byKey) {
      res.push(byKey[key]);
      hasOriginalBucket = hasOriginalBucket || key === bucket;
    }
  }

  if (!hasOriginalBucket && bucket && bucket in byKey) {
    res.pop();
    res.push(byKey[bucket]);
  }

  return res;
}
