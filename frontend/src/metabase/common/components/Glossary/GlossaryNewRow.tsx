import type { FocusEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import type { CreateGlossaryRequest } from "metabase/api";

import S from "./Glossary.module.css";
import { DefinitionField, TermField } from "./GlossaryFields";
import type { GlossaryField } from "./types";
import { isCancelKey, isCommitKey } from "./utils";

type GlossaryNewRowProps = {
  initialDraft: CreateGlossaryRequest;
  isTermTaken: (term: string) => boolean;
  onSave: (draft: CreateGlossaryRequest) => void;
  onCancel: () => void;
};

/**
 * Enter saves once both fields are filled, or moves to the field that is missing or invalid.
 * Leaving the row saves it when complete and changed since it opened, and discards it when empty.
 * Escape discards it.
 */
export function GlossaryNewRow({
  initialDraft,
  isTermTaken,
  onSave,
  onCancel,
}: GlossaryNewRowProps) {
  const [values, setValues] = useState(initialDraft);
  const termRef = useRef<HTMLTextAreaElement>(null);
  const definitionRef = useRef<HTMLTextAreaElement>(null);
  const fieldRefs = { term: termRef, definition: definitionRef };

  const draft = {
    term: values.term.trim(),
    definition: values.definition.trim(),
  };
  const isDuplicate = isTermTaken(draft.term);
  const invalidField = getInvalidField(draft, isDuplicate);
  const isEmpty = draft.term === "" && draft.definition === "";
  const isUnchanged =
    draft.term === initialDraft.term.trim() &&
    draft.definition === initialDraft.definition.trim();

  const handleChange = (field: GlossaryField, value: string) => {
    setValues((values) => ({ ...values, [field]: value }));
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    field: GlossaryField,
  ) => {
    if (isCancelKey(event)) {
      onCancel();
    } else if (isCommitKey(event, field)) {
      event.preventDefault();
      if (invalidField == null) {
        onSave(draft);
      } else {
        fieldRefs[invalidField].current?.focus();
      }
    }
  };

  const handleBlur = (event: FocusEvent<HTMLTableRowElement>) => {
    const isFocusInRow =
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget);
    if (isFocusInRow) {
      return;
    }
    if (isEmpty) {
      onCancel();
      return;
    }
    // A row reopened with a failed draft waits for Enter or an edit instead of retrying on every blur
    if (invalidField != null || isUnchanged) {
      return;
    }
    onSave(draft);
  };

  return (
    <tr className={S.row} onBlur={handleBlur}>
      <td>
        <TermField
          ref={termRef}
          value={values.term}
          placeholder={t`Boat`}
          withBorder
          autoFocus
          isDuplicate={isDuplicate}
          onChange={(value) => handleChange("term", value)}
          onKeyDown={(event) => handleKeyDown(event, "term")}
        />
      </td>
      <td>
        <DefinitionField
          ref={definitionRef}
          value={values.definition}
          placeholder={t`A small vessel propelled on water by oars, sails, or an engine.`}
          withBorder
          onChange={(value) => handleChange("definition", value)}
          onKeyDown={(event) => handleKeyDown(event, "definition")}
        />
      </td>
      <td />
    </tr>
  );
}

function getInvalidField(
  draft: CreateGlossaryRequest,
  isDuplicate: boolean,
): GlossaryField | null {
  if (draft.term === "" || isDuplicate) {
    return "term";
  }
  if (draft.definition === "") {
    return "definition";
  }
  return null;
}
