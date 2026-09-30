/** Inserts `text` at `input`'s current cursor position, calls `onChange`
 * with the resulting string, and restores focus + cursor position after
 * the input's value catches up on the next frame. Shared between the
 * formula bar and the in-cell editing input, which both need to support
 * "point mode" (typing `=`, then clicking cells to build a formula). */
export function insertTextAtCursor(
  input: HTMLInputElement | null,
  currentValue: string,
  textToInsert: string,
  onChange: (next: string) => void,
) {
  const start = input?.selectionStart ?? currentValue.length;
  const end = input?.selectionEnd ?? currentValue.length;
  onChange(
    currentValue.slice(0, start) + textToInsert + currentValue.slice(end),
  );
  const nextCursor = start + textToInsert.length;
  requestAnimationFrame(() => {
    input?.focus();
    input?.setSelectionRange(nextCursor, nextCursor);
  });
}
