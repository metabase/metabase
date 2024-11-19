import { useMemo } from "react";
import { t } from "ttag";

import { inflect } from "metabase/lib/formatting";
import { Select } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import type { ComparisonType } from "../../types";

type Props = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  offset: number;
  value: TemporalUnit | null;
  onChange: (bucket: TemporalUnit | null) => void;
  comparisonType: ComparisonType;
};

export function BucketInput({
  query,
  stageIndex,
  column,
  offset,
  value,
  onChange,
  comparisonType,
}: Props) {
  const options = useMemo(
    () => getOptions(query, stageIndex, offset, column, comparisonType),
    [query, stageIndex, offset, column, comparisonType],
  );

  return (
    <Select
      data={options}
      value={value}
      onChange={onChange}
      aria-label={t`Unit`}
    />
  );
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
  comparisonType: ComparisonType,
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

      const label =
        comparisonType === "offset"
          ? inflect(info.displayName, offset)
          : info.displayName;

      return {
        value: info.shortName,
        label,
      };
    })
    .filter((x): x is SelectItem => x !== null);
}
