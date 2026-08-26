import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { Markdown } from "metabase/common/components/Markdown";
import { SegmentFilterEditor } from "metabase/querying/segments";
import { Card, Stack, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./SegmentEditor.module.css";

type SegmentEditorProps = {
  query: Lib.Query | undefined;
  description: string;
  readOnly?: boolean;
  onQueryChange: (query: Lib.Query) => void;
  onDescriptionChange: (description: string) => void;
};

export function SegmentEditor({
  query,
  description,
  readOnly = false,
  onQueryChange,
  onDescriptionChange,
}: SegmentEditorProps) {
  return (
    <Card withBorder p="xl">
      <Stack flex={1} gap="xl" p={0} className={S.scrollable}>
        {query && (
          <SegmentFilterEditor
            query={query}
            onChange={onQueryChange}
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
