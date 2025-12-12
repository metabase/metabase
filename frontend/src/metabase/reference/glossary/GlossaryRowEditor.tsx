import { useHotkeys } from "@mantine/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
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
  autoFocusField?: "term" | "definition";
};

export function GlossaryRowEditor({
  item,
  onSave,
  onCancel,
  autoFocusField = "term",
}: GlossaryRowEditorProps) {
  const [term, setTerm] = useState(item.term);
  const [definition, setDefinition] = useState(item.definition);

  const canSave = term.trim() !== "" && definition.trim() !== "";

  const save = useCallback(() => {
    void onSave(term.trim(), definition.trim());
    onCancel();
  }, [onSave, onCancel, term, definition]);

  useHotkeys(
    [
      ["mod+Enter", save],
      ["Escape", onCancel],
    ],
    [],
  );

  const { termRef, definitionRef } = useFocusOnMount(autoFocusField);

  return (
    <>
      <Box component="td" valign="top">
        <TextInput
          classNames={{
            input: S.input,
          }}
          fw="bold"
          variant="unstyled"
          autoFocus={autoFocusField === "term"}
          placeholder={t`Bird`}
          value={term}
          onChange={(e) => setTerm(e.currentTarget.value)}
          miw="8rem"
          ref={termRef}
        />
      </Box>
      <Box component="td" valign="top" pr="0">
        <Textarea
          classNames={{
            input: S.input,
          }}
          variant="unstyled"
          placeholder={t`A warm-blooded, egg-laying vertebrate of the class Aves.`}
          value={definition}
          onChange={(e) => setDefinition(e.currentTarget.value)}
          autosize
          minRows={1}
          maxRows={6}
          autoFocus={autoFocusField === "definition"}
          styles={{
            input: {
              paddingTop: "0.75rem",
              paddingBottom: "0.25rem",
              lineHeight: 1.2,
            },
          }}
          ref={definitionRef}
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
          <Tooltip label={t`Save`}>
            <ActionIcon
              aria-label={t`Save`}
              variant={canSave ? "filled" : "subtle"}
              disabled={!canSave}
              onClick={save}
            >
              <Icon name="check" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
    </>
  );
}

function useFocusOnMount(autoFocusField: "term" | "definition") {
  const termRef = useRef<HTMLInputElement>(null);
  const definitionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocusField === "term" && termRef.current) {
      const el = termRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [autoFocusField]);

  useEffect(() => {
    if (autoFocusField === "definition" && definitionRef.current) {
      const el = definitionRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [autoFocusField]);

  return {
    termRef,
    definitionRef,
  };
}
