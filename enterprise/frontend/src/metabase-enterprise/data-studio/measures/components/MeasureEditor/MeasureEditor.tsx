import { t } from "ttag";

import { MeasureAggregationPicker } from "metabase/querying/measures";
import { Card, Stack, Text, TextInput } from "metabase/ui";
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
    <Card withBorder p="xl">
      <Stack flex={1} gap="xl" p={0} className={S.scrollable}>
        {query && (
          <MeasureAggregationPicker
            onChange={onQueryChange}
            query={query}
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
