import { Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { DataStep } from "./DataStep";
import { FilterStep } from "./FilterStep";

const STAGE_INDEX = -1;

type SegmentEditorProps = {
  query: Lib.Query | undefined;
  isNew: boolean;
  onChange: (query: Lib.Query) => void;
};

export function SegmentEditor({ query, isNew, onChange }: SegmentEditorProps) {
  return (
    <Flex>
      <DataStep
        query={query}
        stageIndex={STAGE_INDEX}
        isNew={isNew}
        onChange={onChange}
      />
      <FilterStep query={query} stageIndex={STAGE_INDEX} onChange={onChange} />
    </Flex>
  );
}
