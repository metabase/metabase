import cx from "classnames";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Icon, UnstyledButton } from "metabase/ui";

import S from "../../SummarySidebar.module.css";
import type { SummaryDragItem } from "../../types";
import { WellChip } from "../WellChip";

import styles from "./FormulaChip.module.css";

type FormulaChipProps = {
  drag: Exclude<SummaryDragItem, { kind: "field" }>;
  name?: string;
  onRename: (name: string) => void;
  onRemove: () => void;
  onFocusInput: () => void;
};

export function FormulaChip({
  drag,
  name = drag.item.label,
  onRename,
  onRemove,
  onFocusInput,
}: FormulaChipProps) {
  const { label } = drag.item;
  const [draftName, setDraftName] = useState<string | null>(null);
  const isDone = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isRenaming = draftName !== null;

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const startRenaming = () => {
    isDone.current = false;
    setDraftName(name);
  };

  const finishRenaming = (commit: boolean) => {
    if (isDone.current) {
      return;
    }
    isDone.current = true;
    setDraftName(null);
    const trimmedName = draftName?.trim();
    if (commit && trimmedName && trimmedName !== name) {
      onRename(trimmedName);
    }
  };

  return (
    <WellChip
      drag={drag}
      isDragDisabled={isRenaming}
      className={cx({ [styles.renaming]: isRenaming })}
      onRemove={() => {
        finishRenaming(false);
        onRemove();
      }}
    >
      {draftName !== null ? (
        <span className={S.chipButton}>
          <Icon name="function" size={12} />
          <input
            ref={inputRef}
            className={styles.input}
            aria-label={t`Name of ${name}`}
            value={draftName}
            size={Math.max(draftName.length, 1)}
            autoFocus
            spellCheck={false}
            onChange={(event) => setDraftName(event.currentTarget.value)}
            onBlur={() => finishRenaming(true)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return;
              }
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                finishRenaming(event.key === "Enter");
                onFocusInput();
              }
            }}
          />
        </span>
      ) : (
        <UnstyledButton
          className={S.chipButton}
          aria-label={t`Rename ${label}`}
          onDoubleClick={startRenaming}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === "F2" ||
              event.key === " "
            ) {
              event.preventDefault();
              startRenaming();
            }
          }}
        >
          <Icon name="function" size={12} />
          <span className={S.chipLabel}>{label}</span>
        </UnstyledButton>
      )}
    </WellChip>
  );
}
