import { useState } from "react";
import { t } from "ttag";

import type { GlossaryItem } from "metabase/api";
import { Box, Button, Group, TextInput, Textarea } from "metabase/ui";

type GlossaryRowEditorProps = {
  item: Pick<GlossaryItem, "term" | "definition">;
  onSave: (term: string, definition: string) => void | Promise<void>;
  onCancel: () => void;
  mode: "create" | "edit";
};

export function GlossaryRowEditor({
  item,
  onSave,
  onCancel,
  mode,
}: GlossaryRowEditorProps) {
  const [term, setTerm] = useState(item.term);
  const [definition, setDefinition] = useState(item.definition);

  return (
    <>
      <Box component="td" valign="top">
        <TextInput
          autoFocus
          placeholder={t`Data science`}
          value={term}
          onChange={(e) => setTerm(e.currentTarget.value)}
          miw="8rem"
        />
      </Box>
      <Box component="td" valign="top" pr="0">
        <Textarea
          placeholder={t`A field that uses statistics, computing, and domain knowledge to extract insights from data.`}
          value={definition}
          onChange={(e) => setDefinition(e.currentTarget.value)}
          autosize
          minRows={3}
          maxRows={6}
          resize="vertical"
        />
      </Box>
      <Box component="td" valign="top" align="center" px="md" pt="sm" pb={0}>
        <Group justify="flex-end" gap="xs" wrap="nowrap">
          <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={
              mode === "create" &&
              (term.trim() === "" || definition.trim() === "")
            }
            onClick={() => {
              if (term.trim()) {
                void onSave(term.trim(), definition);
              }
            }}
          >
            {mode === "create" ? t`Add` : t`Save`}
          </Button>
        </Group>
      </Box>
    </>
  );
}
