import { useMemo } from "react";

import { inflect } from "metabase/lib/formatting";
import { Select } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

type Props = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  offset: number;
  value: TemporalUnit | null;
  onChange: (bucket: TemporalUnit | null) => void;
};

export function BucketInput({
  query,
  stageIndex,
  column,
  offset,
  value,
  onChange,
}: Props) {
  const options = useMemo(
    () => getOptions(query, stageIndex, offset, column),
    [query, stageIndex, offset, column],
  );

  return <Select data={options} value={value} onChange={onChange} />;
}

type SelectItem = {
  label: string;
  value: TemporalUnit;
};

function getOptions(
  query: Lib.Query,
  stageIndex: number,
  offset: number,
  column: Lib.ColumnMetadata,
) {
  const availableBuckets = Lib.availableTemporalBuckets(
    query,
    stageIndex,
    column,
  );

  return availableBuckets
    .map(bucket => {
      const info = Lib.displayInfo(query, stageIndex, bucket);
      if (info.isTemporalExtraction) {
        return null;
      }

      return {
        value: info.shortName,
        label: inflect(info.displayName, offset),
      };
    })
    .filter((x): x is SelectItem => x !== null);
}
