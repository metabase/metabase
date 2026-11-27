import { useState } from "react";

import { Code, Stack } from "metabase/ui";

import { FilterBar } from "../components/FilterBar/FilterBar";
import { MOCK_ADAPTER, MOCK_STAGES, type MockFilter } from "../test-utils";
import type { FilterStages } from "../types";

export const FilterBarDevPage = () => {
  const [stages, setStages] = useState<FilterStages<MockFilter>>(MOCK_STAGES);

  return (
    <Stack p="xl" gap="lg">
      <FilterBar value={stages} onChange={setStages} adapter={MOCK_ADAPTER} />
      <Code block>{JSON.stringify(stages, null, 2)}</Code>
    </Stack>
  );
};
