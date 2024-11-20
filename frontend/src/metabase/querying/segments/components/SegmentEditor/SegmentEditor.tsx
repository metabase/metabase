import { DataStep } from "metabase/querying/segments/components/SegmentEditor/DataStep";
import type * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

type SegmentEditorProps = {
  query: Lib.Query | undefined;
  onChange: (query: Lib.Query) => void;
};

export function SegmentEditor({ query, onChange }: SegmentEditorProps) {
  return (
    <DataStep query={query} stageIndex={STAGE_INDEX} onChange={onChange} />
  );
}
