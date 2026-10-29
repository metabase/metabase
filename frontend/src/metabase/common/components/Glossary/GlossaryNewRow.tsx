import type { FocusEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import S from "./Glossary.module.css";
import {
  DefinitionField,
  TermField,
  focusField,
  isCommitKey,
  isDuplicateTerm,
} from "./GlossaryFields";

type GlossaryNewRowProps = {
  existingTerms: string[];
  onSave: (term: string, definition: string) => void;
  onCancel: () => void;
};

/**
 * Saves once both fields are filled and the user presses Enter or moves focus out of the row.
 * Escape, or leaving the row with both fields empty, discards it.
 */
export function GlossaryNewRow({
  existingTerms,
  onSave,
  onCancel,
}: GlossaryNewRowProps) {
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const termRef = useRef<HTMLDivElement>(null);
  const definitionRef = useRef<HTMLDivElement>(null);
  // Escape and Enter blur the focused field, so the row's blur handler must not act a second time
  const isClosedRef = useRef(false);

  const isDuplicate = isDuplicateTerm(term, existingTerms);
  const canSave =
    term.trim() !== "" && definition.trim() !== "" && !isDuplicate;

  useEffect(() => {
    focusField(termRef.current);
  }, []);

  const save = () => {
    if (!isClosedRef.current) {
      isClosedRef.current = true;
      onSave(term.trim(), definition.trim());
    }
  };

  const cancel = () => {
    if (!isClosedRef.current) {
      isClosedRef.current = true;
      onCancel();
    }
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Escape") {
      cancel();
    }
  };

  const handleRowBlur = (event: FocusEvent<HTMLTableRowElement>) => {
    const nextFocused = event.relatedTarget;
    if (
      nextFocused instanceof Node &&
      event.currentTarget.contains(nextFocused)
    ) {
      return;
    }
    if (canSave) {
      save();
    } else if (term.trim() === "" && definition.trim() === "") {
      cancel();
    }
  };

  const handleTermKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isCommitKey(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (canSave) {
      save();
    } else if (term.trim() !== "" && !isDuplicate) {
      focusField(definitionRef.current);
    }
  };

  const handleDefinitionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isCommitKey(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (canSave) {
      save();
    } else if (term.trim() === "") {
      focusField(termRef.current);
    }
  };

  return (
    <tr
      className={S.row}
      onKeyDownCapture={handleRowKeyDown}
      onBlur={handleRowBlur}
    >
      <td>
        <TermField
          ref={termRef}
          placeholder={t`Boat`}
          isOptional
          isEditing
          isDuplicate={isDuplicate}
          onContentChange={setTerm}
          onKeyDownCapture={handleTermKeyDown}
        />
      </td>
      <td>
        <DefinitionField
          ref={definitionRef}
          placeholder={t`A small vessel propelled on water by oars, sails, or an engine.`}
          isOptional
          isEditing
          onContentChange={setDefinition}
          onKeyDownCapture={handleDefinitionKeyDown}
        />
      </td>
      <td />
    </tr>
  );
}
