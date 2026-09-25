import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

import { setup } from "./setup";

describe("EditSnippetPage", () => {
  it("renders the snippet header", async () => {
    await setup({ snippet: { name: "Batman's snippet" } });

    expect(screen.getByTestId("snippet-header")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("snippet-header")).getByRole("textbox"),
    ).toHaveValue("Batman's snippet");
  });

  it("renders the code editor", async () => {
    await setup({ snippet: { name: "Batman's snippet" } });
    expect(await screen.findByTestId("snippet-editor")).toBeInTheDocument();
    expect(screen.getByTestId("snippet-editor")).toBeEnabled();
  });

  it("restores the saved content when editing is cancelled", async () => {
    await setup({
      snippet: { name: "Batman's snippet", content: "SELECT * FROM orders" },
    });

    const editor = screen.getByTestId("snippet-editor");
    await userEvent.type(editor, " WHERE id = 1");
    expect(editor).toHaveValue("SELECT * FROM orders WHERE id = 1");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(editor).toHaveValue("SELECT * FROM orders");
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("renders the description input", async () => {
    await setup({
      snippet: {
        name: "Batman's snippet",
        description: "My snippet description",
      },
    });
    await userEvent.click(
      within(screen.getByTestId("edit-snippet-page")).getByText(
        "My snippet description",
      ),
    );
    expect(screen.getByPlaceholderText("No description")).toHaveValue(
      "My snippet description",
    );
    expect(screen.getByPlaceholderText("No description")).toBeEnabled();
  });
});
