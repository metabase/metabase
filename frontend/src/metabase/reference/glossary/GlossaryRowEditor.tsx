import { useState } from "react";
import { t } from "ttag";

import type { GlossaryItem } from "metabase/api";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  TextInput,
  Textarea,
  Tooltip,
} from "metabase/ui";

import S from "./Glossary.module.css";

type GlossaryRowEditorProps = {
  item: Pick<GlossaryItem, "term" | "definition">;
  onSave: (term: string, definition: string) => void | Promise<void>;
  onCancel: () => void;
  mode: "create" | "edit";
  autoFocusField?: "term" | "definition";
};

export function GlossaryRowEditor({
  item,
  onSave,
  onCancel,
  mode,
  autoFocusField = "term",
}: GlossaryRowEditorProps) {
  const [term, setTerm] = useState(item.term);
  const [definition, setDefinition] = useState(item.definition);

  const canSave = term.trim() !== "" && definition.trim() !== "";

  return (
    <>
      <Box component="td" valign="top">
        <TextInput
          classNames={{
            input: S.input,
          }}
          variant="unstyled"
          autoFocus={autoFocusField === "term"}
          placeholder={t`Bird`}
          value={term}
          onChange={(e) => setTerm(e.currentTarget.value)}
          miw="8rem"
        />
      </Box>
      <Box component="td" valign="top" pr="0">
        <Textarea
          classNames={{
            input: S.input,
          }}
          variant="unstyled"
          placeholder={t`A thing with wings.`}
          value={definition}
          onChange={(e) => setDefinition(e.currentTarget.value)}
          autosize
          minRows={1}
          maxRows={6}
          autoFocus={autoFocusField === "definition"}
          styles={{
            input: {
              paddingTop: "0.75rem",
            },
          }}
        />
      </Box>
      <Box component="td" valign="top" align="center" px="md" pt="sm" pb={0}>
        <Group justify="flex-end" gap="xs" wrap="nowrap">
          <Tooltip label={t`Cancel`}>
            <ActionIcon
              aria-label={t`Cancel`}
              variant="subtle"
              onClick={onCancel}
            >
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={mode === "create" ? t`Add` : t`Save`}>
            <ActionIcon
              aria-label={mode === "create" ? t`Add` : t`Save`}
              variant={canSave ? "filled" : "subtle"}
              disabled={!canSave}
              onClick={() => void onSave(term.trim(), definition.trim())}
            >
              <Icon name="check" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
    </>
  );
}
