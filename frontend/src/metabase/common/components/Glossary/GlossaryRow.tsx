import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import type { GlossaryItem, UpdateGlossaryRequest } from "metabase/api";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import S from "./Glossary.module.css";
import { DefinitionField, TermField } from "./GlossaryFields";
import type { GlossaryField } from "./types";
import { isCancelKey, isCommitKey } from "./utils";

type GlossaryRowProps = {
  item: GlossaryItem;
  readOnly: boolean;
  isDuplicateTerm: (term: string) => boolean;
  onEdit: (request: UpdateGlossaryRequest) => void;
  onDeleteClick: (item: GlossaryItem) => void;
};

/** A field being edited, absent from the draft while it shows the saved value. */
type GlossaryRowDraft = Partial<Record<GlossaryField, string>>;

/** Each field saves on its own when it loses focus; a blank, unchanged, or duplicate value reverts. */
export function GlossaryRow({
  item,
  readOnly,
  isDuplicateTerm,
  onEdit,
  onDeleteClick,
}: GlossaryRowProps) {
  const [draft, setDraft] = useState<GlossaryRowDraft>({});
  // Escape leaves a field through blur, which would otherwise save the draft
  const isCancellingRef = useRef(false);
  const isDuplicate = draft.term != null && isDuplicateTerm(draft.term);

  const discardDraft = (field: GlossaryField) => {
    setDraft(({ [field]: _discarded, ...rest }) => rest);
  };

  const handleBlur = (field: GlossaryField) => {
    const value = draft[field]?.trim();
    const isCancelled = isCancellingRef.current;
    isCancellingRef.current = false;
    discardDraft(field);
    const isSavable =
      !isCancelled &&
      value != null &&
      value !== "" &&
      value !== item[field] &&
      !(field === "term" && isDuplicateTerm(value));
    if (isSavable) {
      onEdit({
        id: item.id,
        term: item.term,
        definition: item.definition,
        [field]: value,
      });
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    field: GlossaryField,
  ) => {
    if (isCancelKey(event)) {
      isCancellingRef.current = true;
      event.currentTarget.blur();
    } else if (isCommitKey(event, field)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <tr className={S.row}>
      <td>
        <TermField
          value={draft.term ?? item.term}
          readOnly={readOnly}
          isDuplicate={isDuplicate}
          onChange={(term) => setDraft((draft) => ({ ...draft, term }))}
          onBlur={() => handleBlur("term")}
          onKeyDown={(event) => handleKeyDown(event, "term")}
        />
      </td>
      <td>
        <DefinitionField
          value={draft.definition ?? item.definition}
          readOnly={readOnly}
          onChange={(definition) =>
            setDraft((draft) => ({ ...draft, definition }))
          }
          onBlur={() => handleBlur("definition")}
          onKeyDown={(event) => handleKeyDown(event, "definition")}
        />
      </td>
      <td align="center">
        {!readOnly && (
          <Tooltip label={t`Delete`}>
            <ActionIcon
              aria-label={t`Delete`}
              variant="subtle"
              c="text-disabled"
              className={S.action}
              onClick={() => onDeleteClick(item)}
            >
              <Icon name="trash" />
            </ActionIcon>
          </Tooltip>
        )}
      </td>
    </tr>
  );
}
