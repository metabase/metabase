import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { Editor } from "./Editor";

// Witness for metabase#63180: when the editor is (re)mounted with a clause that
// is different from the initialClause (as happens when a combine/extract shortcut
// creates a brand-new expression), the source must be considered *changed* so the
// popover cannot be silently closed by an outside click, losing the user's work.
//
// The seam is `hasSourceChanged = source !== initialSource`, driven by whether the
// mount-time format is treated as "initial". The fix formats with
// `initial: clause === initialClause`; the bug formatted with `initial: true`
// unconditionally, marking the shortcut-generated expression as pristine.
describe("Editor (metabase#63180 witness)", () => {
  it("treats a shortcut-generated clause (clause !== initialClause) as unsaved changes, guarding outside clicks", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const stageIndex = 0;
    const availableColumns = Lib.expressionableColumns(query, stageIndex);

    // A freshly-created expression: clause is populated (e.g. by a shortcut) but
    // initialClause is null because this is a NEW expression.
    const clause = Lib.expressionClause("+", [1, 1]);

    renderWithProviders(
      <div>
        <button type="button">outside</button>
        <Editor
          expressionMode="expression"
          query={query}
          stageIndex={stageIndex}
          availableColumns={availableColumns}
          clause={clause}
          initialClause={null}
          onChange={jest.fn()}
        />
      </div>,
    );

    // Wait for the on-mount format to finish and populate the source.
    const editor = await screen.findByTestId("custom-expression-query-editor");
    await waitFor(() => expect(editor).toHaveProperty("readOnly", false));
    await screen.findByDisplayValue("1 + 1");

    // Clicking an active element outside the editor must be guarded and pop the
    // "keep editing?" confirmation, proving the editor knows it has unsaved work.
    await userEvent.click(screen.getByRole("button", { name: "outside" }));

    expect(
      await screen.findByText("Keep editing your custom expression?"),
    ).toBeInTheDocument();
  });
});
