import {
  type FocusEvent,
  type KeyboardEvent,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { t } from "ttag";

import { Group, Icon, Text, TextInput } from "metabase/ui";

import { insertTextAtCursor } from "./insert-at-cursor";

/** Marks both the formula bar's input and the in-cell editing input as
 * belonging to the same editing session, so blurring from one to the
 * other doesn't get treated as clicking away (which would commit). */
export const EDIT_INPUT_MARKER = "data-spreadsheet-edit-input";

function isEditInputElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.hasAttribute(EDIT_INPUT_MARKER)
  );
}

export interface FormulaBarHandle {
  /** Inserts `text` at the input's current cursor position and refocuses
   * it — used when clicking a grid cell while a formula is being edited
   * ("point mode", like typing `=` then clicking a cell in Excel). */
  insertAtCursor: (text: string) => void;
  /** Focuses the input, optionally moving the cursor to a specific
   * position (used after accepting a function-name suggestion). */
  focus: (cursorPosition?: number) => void;
}

interface FormulaBarProps {
  cellLabel: string | null;
  /** Whether the selected cell can be typed into (an existing formula
   * field, or an empty trailing column) as opposed to a read-only
   * query-derived source column. */
  isEditable: boolean;
  isEditing: boolean;
  /** The editing draft when `isEditing`, otherwise the read-only display
   * value for the selected cell. */
  value: string;
  onChangeValue: (value: string, cursorPosition: number) => void;
  onStartEditing: () => void;
  /** Enter/Escape (and, while a function-name suggestion dropdown is
   * open, Up/Down/Tab too) are all handled by the parent — it owns the
   * shared editing state both this input and the in-cell one write to. */
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Clicking away (not to the in-cell input — see isEditInputElement)
   * commits, same as Enter. */
  onCommit: () => void;
}

export const FormulaBar = forwardRef<FormulaBarHandle, FormulaBarProps>(
  function FormulaBar(
    {
      cellLabel,
      isEditable,
      isEditing,
      value,
      onChangeValue,
      onStartEditing,
      onKeyDown,
      onCommit,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) =>
        insertTextAtCursor(inputRef.current, value, text, (next) =>
          onChangeValue(next, inputRef.current?.selectionStart ?? next.length),
        ),
      focus: (cursorPosition?: number) => {
        inputRef.current?.focus();
        if (cursorPosition != null) {
          inputRef.current?.setSelectionRange(cursorPosition, cursorPosition);
        }
      },
    }));

    return (
      <Group
        gap="sm"
        px="md"
        py="xs"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Text
          size="sm"
          c="text-secondary"
          w={40}
          style={{ textAlign: "center" }}
        >
          {cellLabel ?? ""}
        </Text>
        <Icon
          name="formula"
          size={14}
          c={isEditable ? "brand" : "text-secondary"}
        />
        <TextInput
          ref={inputRef}
          data-testid="spreadsheet-formula-bar-input"
          {...{ [EDIT_INPUT_MARKER]: "true" }}
          flex={1}
          size="xs"
          disabled={!cellLabel}
          readOnly={!isEditable}
          placeholder={
            !cellLabel
              ? t`Select a cell`
              : isEditable
                ? t`Type a formula, e.g. =A1 + A2, or click cells to reference them`
                : undefined
          }
          value={value}
          onFocus={() => {
            if (isEditable && !isEditing) {
              onStartEditing();
            }
          }}
          onChange={(event) =>
            onChangeValue(
              event.currentTarget.value,
              event.currentTarget.selectionStart ??
                event.currentTarget.value.length,
            )
          }
          onKeyDown={onKeyDown}
          onBlur={(event: FocusEvent<HTMLInputElement>) => {
            // Focus moving to the in-cell editing input isn't "clicking
            // away" — it's the same edit continuing in the other input.
            if (
              isEditable &&
              isEditing &&
              !isEditInputElement(event.relatedTarget)
            ) {
              onCommit();
            }
          }}
        />
      </Group>
    );
  },
);
