import { useMemo } from "react";
import { t } from "ttag";

import { Flex, Stack, Button, Input } from "metabase/ui";
import * as Lib from "metabase-lib";

type Preset = {
  bucket: Lib.Bucket;
  displayName: string;
  shortName: string;
};

type Props = {
  query: Lib.Query;
  stageIndex: number;
  bucket: Lib.Bucket;
  column: Lib.ColumnMetadata;
  onBucketChange: (bucket: Lib.Bucket) => void;
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
  // TODO:
  // - do not use ref equality for bucket, but use shortName
  // - render this in CompareAggregations

  const presets = getPreferredPresets(query, stageIndex, column);
  const bucketInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, bucket),
    [query, stageIndex, bucket],
  );

  return (
    <Stack spacing="sm">
      <Input.Label>{t`How to compare`}</Input.Label>
      <Flex align="flex-end" pos="relative" gap="sm">
        {presets.map(preset => (
          <Button
            key={preset.shortName}
            variant={
              preset.shortName === bucketInfo.shortName ? "filled" : "default"
            }
            radius="xl"
            p="sm"
            onClick={() => onBucketChange(preset.bucket)}
          >
            {preset.displayName}
          </Button>
        ))}

        <Button
          variant="default"
          radius="xl"
          p="sm"
          onClick={onShowOffsetInput}
        >
          {t`Custom...`}
        </Button>
      </Flex>
    </Stack>
  );
}

function getPreferredPresets(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const availabeBuckets = Lib.availableTemporalBuckets(
    query,
    stageIndex,
    column,
  );

  const byKey: Record<string, Preset> = {};
  for (const bucket of availabeBuckets) {
    const info = Lib.displayInfo(query, stageIndex, bucket);
    byKey[info.shortName] = {
      bucket,
      shortName: info.shortName,
      displayName: t`Previous ${info.displayName.toLowerCase()}`,
    };
  }

  const res = [];
  for (const key of PREFERRED_PRESETS) {
    if (res.length >= 2) {
      break;
    }
    if (key in byKey) {
      res.push(byKey[key]);
    }
  }

  return res;
}
