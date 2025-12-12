import { t } from "ttag";

import { SegmentFilterEditor } from "metabase/querying/segments";
import { Stack, Textarea } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./SegmentEditor.module.css";

type SegmentEditorProps = {
  query: Lib.Query | undefined;
  description: string;
  onQueryChange: (query: Lib.Query) => void;
  onDescriptionChange: (description: string) => void;
};

export function SegmentEditor({
  query,
  description,
  onQueryChange,
  onDescriptionChange,
}: SegmentEditorProps) {
  return (
    <Stack flex={1} gap="lg" px="lg" py="lg" className={S.scrollable}>
      {query && <SegmentFilterEditor query={query} onChange={onQueryChange} />}
      <Textarea
        label={t`Description`}
        placeholder={t`Give it a description`}
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        maw={400}
      />
    </Stack>
  );
}
