import { t } from "ttag";

import { MeasureAggregationPicker } from "metabase/querying/measures";
import { Stack, Textarea } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./MeasureEditor.module.css";

type MeasureEditorProps = {
  query: Lib.Query;
  description: string;
  onQueryChange: (query: Lib.Query) => void;
  onDescriptionChange: (description: string) => void;
};

export function MeasureEditor({
  query,
  description,
  onQueryChange,
  onDescriptionChange,
}: MeasureEditorProps) {
  return (
    <Stack flex={1} gap="lg" px="lg" py="lg" className={S.scrollable}>
      <MeasureAggregationPicker query={query} onChange={onQueryChange} />
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
