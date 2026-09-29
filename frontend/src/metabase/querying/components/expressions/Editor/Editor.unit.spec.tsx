import userEvent from "@testing-library/user-event";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { Editor } from "./Editor";

describe("Editor", () => {
  it("should ask to keep editing when clicking outside a new expression created from a shortcut (metabase#63180)", async () => {
    setupDatabaseEndpoints(createSampleDatabase());
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const stageIndex = 0;
    const availableColumns = Lib.expressionableColumns(query, stageIndex);

    // A combine or extract shortcut creates a new expression, so there is a clause but no initialClause.
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

    await userEvent.click(screen.getByRole("button", { name: "outside" }));

    expect(
      await screen.findByText("Keep editing your custom expression?"),
    ).toBeInTheDocument();
  });
});
