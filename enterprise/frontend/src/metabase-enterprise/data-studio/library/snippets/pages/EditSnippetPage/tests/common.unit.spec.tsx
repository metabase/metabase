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
