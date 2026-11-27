import cx from "classnames";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Icon, Tooltip, UnstyledButton } from "metabase/ui";

import { getPillShadeVars } from "../NotebookCell/pill-shades";

import S from "./ExpressionPillB.module.css";

type ExpressionPillBProps = {
  name: string;
  /** The color of the step: brand for custom columns. */
  color?: string;
  isActive: boolean;
  readOnly?: boolean;
  /** True while the column has the name it got by default, like "Untitled". */
  isNameDefault?: boolean;
  hasUnsavedChanges?: boolean;
  hasRemoveButton?: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
};

/**
 * Prototype, pill style B: the custom column pill, with its name in a box
 * like a text field, to show that it can be renamed. A double-click renames
 * it. Figma: Custom expressions file, frame 373:19836.
 */
export function ExpressionPillB({
  name,
  color = "core-brand",
  isActive,
  readOnly,
  isNameDefault = false,
  hasUnsavedChanges = false,
  hasRemoveButton = !readOnly,
  onOpen,
  onRename,
  onRemove,
}: ExpressionPillBProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (isRenaming && input != null) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, [isRenaming]);

  const canRenameNow = !readOnly;

  const handleClick = useCallback(() => {
    if (!readOnly && !isActive) {
      onOpen();
    }
  }, [readOnly, isActive, onOpen]);

  // A default name, like "Untitled", is a placeholder: renaming starts empty.
  const handleDoubleClick = useCallback(() => {
    if (canRenameNow) {
      setDraftName(isNameDefault ? "" : name);
      setIsRenaming(true);
    }
  }, [canRenameNow, isNameDefault, name]);

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
        [S.isRenaming]: isRenaming,
      })}
      style={getPillShadeVars(color)}
      onClick={isRenaming ? undefined : handleClick}
      onDoubleClick={isRenaming ? undefined : handleDoubleClick}
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
          [S.isDefault]: isRenaming ? draftName === "" : isNameDefault,
          [S.isRenameable]: canRenameNow,
          [S.isRenaming]: isRenaming,
        })}
      >
        <span className={cx(S.nameText, { [S.isSizer]: isRenaming })}>
          {isRenaming ? draftName || name : name}
        </span>
        {isRenaming && (
          <input
            ref={inputRef}
            className={S.input}
            value={draftName}
            data-testid="expression-name"
            autoFocus
            placeholder={isNameDefault ? name : undefined}
            aria-label={name}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
          />
        )}
      </span>
      {hasRemoveButton && (
        <Icon
          className={S.closeIcon}
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
      style={getPillShadeVars("core-brand")}
      aria-label={t`Add a custom column`}
      onClick={onClick}
    >
      <Icon name="add" size={16} />
    </UnstyledButton>
  );
}
