import { t } from "ttag";

import { SegmentFilterEditor } from "metabase/querying/segments";
import { Card, Stack, Text, TextInput } from "metabase/ui";
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
          <TextInput
            label={t`Give it a description`}
            placeholder={t`Only if it really needs it`}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            maw={400}
            classNames={{
              label: S.descriptionLabel,
            }}
          />
        )}
        {readOnly && description && (
          <Stack gap="sm">
            <Text fw="bold">{t`Description`}</Text>
            <Text c="text-secondary">{description}</Text>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
