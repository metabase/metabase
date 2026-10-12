import { Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { DataStep } from "./DataStep";
import { FilterStep } from "./FilterStep";
import { PreviewStep } from "./PreviewStep";
import S from "./SegmentEditor.module.css";

const STAGE_INDEX = -1;

type SegmentEditorProps = {
  query: Lib.Query | undefined;
  isNew: boolean;
  onChange: (query: Lib.Query) => void;
  readOnly?: boolean;
};

export function SegmentEditor({
  query,
  isNew,
  onChange,
  readOnly,
}: SegmentEditorProps) {
  return (
    <Flex className={S.root} data-testid="segment-editor">
      <DataStep
        query={query}
        stageIndex={STAGE_INDEX}
        isNew={isNew}
        onChange={onChange}
      />
      <FilterStep
        query={query}
        stageIndex={STAGE_INDEX}
        onChange={onChange}
        readOnly={readOnly}
      />
      <PreviewStep query={query} stageIndex={STAGE_INDEX} />
    </Flex>
  );
}
