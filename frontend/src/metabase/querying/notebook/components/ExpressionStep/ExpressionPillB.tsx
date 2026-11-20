import cx from "classnames";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Icon, Tooltip, UnstyledButton } from "metabase/ui";

import S from "./ExpressionPillB.module.css";

type ExpressionPillBProps = {
  name: string;
  isActive: boolean;
  readOnly?: boolean;
  /** Off for a draft, which has no clause to carry a name yet. */
  canRename?: boolean;
  /** True while the column has the name it got by default, like "Untitled". */
  isNameDefault?: boolean;
  hasUnsavedChanges?: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
};

/**
 * Prototype, pill style B: the custom column pill, with its name in a box
 * like a text field, to show that it can be renamed. The box shows while the
 * name is a default, and on hover or while the pill is selected. Behaves like
 * `ExpressionPill`.
 */
export function ExpressionPillB({
  name,
  isActive,
  readOnly,
  canRename = true,
  isNameDefault = false,
  hasUnsavedChanges = false,
  onOpen,
  onRename,
  onRemove,
}: ExpressionPillBProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const canRenameNow = isActive && canRename && !readOnly;

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
    <div
      className={cx(S.pill, {
        [S.isActive]: isActive,
        [S.isReadOnly]: readOnly,
      })}
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
          [S.isDefault]: isNameDefault && !isRenaming,
          [S.isRenameable]: canRenameNow,
          [S.isRenaming]: isRenaming,
        })}
      >
        <span className={S.nameText}>
          {isRenaming ? draftName || " " : name}
        </span>
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
      {!readOnly && (
        <Icon
          className={cx(S.closeIcon, { [S.hiddenWhileRenaming]: isRenaming })}
          name="close"
          size={16}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        />
      )}
    </div>
  );
}

/** Prototype, pill style B: the "+" next to the pills, a square in the pill's color. */
export function ExpressionAddButtonB({ onClick }: { onClick: () => void }) {
  return (
    <UnstyledButton
      className={S.addButton}
      aria-label={t`Add a custom column`}
      onClick={onClick}
    >
      <Icon name="add" size={16} />
    </UnstyledButton>
  );
}
