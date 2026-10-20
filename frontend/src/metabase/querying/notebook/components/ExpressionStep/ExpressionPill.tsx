import cx from "classnames";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Icon, Tooltip } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import { NotebookCellItem } from "../NotebookCell";

import S from "./ExpressionPill.module.css";

type ExpressionPillProps = {
  name: string;
  color: ColorName;
  isActive: boolean;
  readOnly?: boolean;
  /** Off for a draft, which has no clause to carry a name yet. */
  canRename?: boolean;
  hasUnsavedChanges?: boolean;
  hasRemoveButton?: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
};

export function ExpressionPill({
  name,
  color,
  isActive,
  readOnly,
  canRename = true,
  hasUnsavedChanges = false,
  hasRemoveButton = !readOnly,
  onOpen,
  onRename,
  onRemove,
}: ExpressionPillProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const handleClick = useCallback(() => {
    if (readOnly) {
      return;
    }
    if (isActive && canRename) {
      setDraftName(name);
      setIsRenaming(true);
    } else if (!isActive) {
      onOpen();
    }
  }, [readOnly, isActive, canRename, name, onOpen]);

  const handleCommit = useCallback(() => {
    setIsRenaming(false);

    const nextName = draftName.trim();
    if (nextName !== "" && nextName !== name) {
      onRename(nextName);
    }
  }, [draftName, name, onRename]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.key === "Enter") {
        handleCommit();
      }
      if (event.key === "Escape") {
        setIsRenaming(false);
      }
    },
    [handleCommit],
  );

  return (
    <NotebookCellItem
      color={color}
      readOnly={readOnly}
      selected={isActive}
      className={cx({ [S.renameable]: isActive && canRename && !readOnly })}
      onClick={isRenaming ? undefined : handleClick}
      data-testid={isActive ? "selected-expression-pill" : "expression-pill"}
    >
      {hasUnsavedChanges && (
        <Tooltip
          label={t`Invalid or empty expressions aren't saved to your question.`}
        >
          <span
            className={S.unsavedIndicator}
            data-testid="unsaved-indicator"
            aria-label={t`Invalid or empty expressions aren't saved to your question.`}
          />
        </Tooltip>
      )}
      <span
        className={cx(S.name, {
          [S.renameable]: isActive && canRename && !readOnly,
        })}
      >
        {isRenaming ? draftName || "\u00a0" : name}
        {isRenaming && (
          <input
            ref={inputRef}
            className={S.input}
            value={draftName}
            data-testid="expression-name"
            autoFocus
            aria-label={name}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
          />
        )}
      </span>
      {hasRemoveButton && (
        <Icon
          className={cx(S.closeIcon, { [S.hiddenWhileRenaming]: isRenaming })}
          name="close"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        />
      )}
    </NotebookCellItem>
  );
}
