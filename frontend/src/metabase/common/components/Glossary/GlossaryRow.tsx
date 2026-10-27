import type { KeyboardEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import type { GlossaryItem } from "metabase/api";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import S from "./Glossary.module.css";
import {
  DefinitionField,
  TermField,
  isCommitKey,
  isDuplicateTerm,
} from "./GlossaryFields";

type GlossaryRowProps = {
  item: GlossaryItem;
  otherTerms: string[];
  readOnly: boolean;
  onEdit?: (
    id: number,
    term: string,
    definition: string,
  ) => Promise<void> | void;
  onDeleteClick: (item: GlossaryItem) => void;
};

export function GlossaryRow({
  item,
  otherTerms,
  readOnly,
  onEdit,
  onDeleteClick,
}: GlossaryRowProps) {
  const [draftTerm, setDraftTerm] = useState<string | null>(null);
  // Bumping a key remounts its field, discarding a rejected value
  const [termKey, setTermKey] = useState(0);
  const [definitionKey, setDefinitionKey] = useState(0);
  const isDuplicate =
    draftTerm != null && isDuplicateTerm(draftTerm, otherTerms);

  const handleTermChange = (value: string) => {
    const term = value.trim();
    if (
      term === "" ||
      term === item.term ||
      isDuplicateTerm(term, otherTerms)
    ) {
      setTermKey((key) => key + 1);
      return;
    }
    onEdit?.(item.id, term, item.definition);
  };

  const handleDefinitionChange = (value: string) => {
    const definition = value.trim();
    if (definition === "" || definition === item.definition) {
      setDefinitionKey((key) => key + 1);
      return;
    }
    onEdit?.(item.id, item.term, definition);
  };

  const handleDefinitionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isCommitKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.target instanceof HTMLElement) {
        event.target.blur();
      }
    }
  };

  return (
    <tr className={S.row}>
      <td>
        <TermField
          key={termKey}
          initialValue={item.term}
          isDisabled={readOnly}
          isDuplicate={isDuplicate}
          onContentChange={setDraftTerm}
          onChange={handleTermChange}
          onBlur={() => setDraftTerm(null)}
        />
      </td>
      <td>
        <DefinitionField
          key={definitionKey}
          initialValue={item.definition}
          isDisabled={readOnly}
          onChange={handleDefinitionChange}
          onKeyDownCapture={handleDefinitionKeyDown}
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
