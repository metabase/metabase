import { checkNotNull } from "metabase/utils/types";

export function getDiffControls(container: HTMLElement) {
  const row = checkNotNull(
    container.querySelector<HTMLDivElement>(".cm-diff-controls"),
  );
  return {
    row,
    previousLine: row.previousElementSibling,
    nextLine: row.nextElementSibling,
    parent: row.parentElement,
  };
}
