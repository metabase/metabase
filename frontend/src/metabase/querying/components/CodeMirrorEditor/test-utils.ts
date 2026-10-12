import { screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

export function getDiffControls(container = screen.getByRole("textbox")) {
  const row = checkNotNull(
    container.querySelector<HTMLDivElement>(".cm-diff-controls"),
  );
  expect(
    within(row).getByRole("button", { name: /Accept/ }),
  ).toBeInTheDocument();
  expect(
    within(row).getByRole("button", { name: /Reject/ }),
  ).toBeInTheDocument();
  return {
    row,
    previousLine: row.previousElementSibling,
    nextLine: row.nextElementSibling,
    parent: row.parentElement,
  };
}
