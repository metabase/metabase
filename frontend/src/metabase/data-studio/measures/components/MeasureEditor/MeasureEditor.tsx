import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { Markdown } from "metabase/common/components/Markdown";
import { MeasureAggregationPicker } from "metabase/querying/measures";
import { Card, Stack, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./MeasureEditor.module.css";

type MeasureEditorProps = {
  query: Lib.Query | undefined;
  description: string;
  onQueryChange: (query: Lib.Query) => void;
  onDescriptionChange: (description: string) => void;
  readOnly?: boolean;
};

export function MeasureEditor({
  query,
  description,
  onQueryChange,
  onDescriptionChange,
  readOnly = false,
}: MeasureEditorProps) {
  return (
    <Card withBorder p="xxl">
      <Stack flex={1} gap="xxl" p={0} className={S.scrollable}>
        {query && (
          <MeasureAggregationPicker
            onChange={onQueryChange}
            query={query}
            readOnly={readOnly}
          />
        )}
        {!readOnly && (
          <Stack gap="sm">
            <Text fw="bold">{t`Give it a description`}</Text>
            <EditableText
              placeholder={t`Only if it really needs it`}
              initialValue={description}
              onContentChange={onDescriptionChange}
              maw={400}
              className={S.descriptionInput}
              aria-label={t`Give it a description`}
              isMultiline
              isMarkdown
              isOptional
            />
          </Stack>
        )}
        {readOnly && description && (
          <Stack gap="sm">
            <Text fw="bold">{t`Description`}</Text>
            <Markdown c="text-secondary">{description}</Markdown>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
