import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon, TextInput } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import { NotebookCellItem } from "../NotebookCell";

import S from "./ExpressionPill.module.css";

type ExpressionPillProps = {
  name: string;
  color: ColorName;
  isActive: boolean;
  readOnly?: boolean;
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
    if (isActive) {
      setDraftName(name);
      setIsRenaming(true);
    } else {
      onOpen();
    }
  }, [readOnly, isActive, name, onOpen]);

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
      onClick={isRenaming ? undefined : handleClick}
      data-testid={isActive ? "selected-expression-pill" : "expression-pill"}
    >
      {isRenaming ? (
        <TextInput
          ref={inputRef}
          value={draftName}
          data-testid="expression-name"
          autoFocus
          variant="unstyled"
          aria-label={name}
          classNames={{ root: S.inputRoot, input: S.input }}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        name
      )}
      {hasRemoveButton && !isRenaming && (
        <Icon
          className={S.closeIcon}
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
