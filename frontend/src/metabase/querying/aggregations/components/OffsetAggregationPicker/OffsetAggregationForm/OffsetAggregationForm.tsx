import { useState } from "react";
import { t } from "ttag";

import { Button, Stack } from "metabase/ui";

import { ComparisonTypeInput } from "./ComparisonTypeInput";
import type { ComparisonType, OffsetOptions } from "./types";

export function OffsetAggregationForm() {
  const [options, setOptions] = useState<OffsetOptions>({
    comparisonType: "offset",
  });

  const handleComparisonTypeChange = (comparisonType: ComparisonType) => {
    setOptions({ ...options, comparisonType });
  };

  return (
    <form>
      <Stack>
        <ComparisonTypeInput
          value={options.comparisonType}
          onChange={handleComparisonTypeChange}
        />
        <Button variant="filled" type="submit">{t`Done`}</Button>
      </Stack>
    </form>
  );
}
