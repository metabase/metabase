import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, screen, waitFor, within } from "__support__/ui";

import { setup } from "./setup";

const SNIPPET_CONTENT = "SELECT * FROM orders";

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

  describe("unsaved changes", () => {
    it("leaves the page without a warning when there are no edits", async () => {
      await setup({ snippet: { content: SNIPPET_CONTENT } });

      await userEvent.click(
        screen.getByRole("link", { name: "Other page link" }),
      );

      expect(await screen.findByText("Other page")).toBeInTheDocument();
      expect(
        screen.queryByText("Discard your changes?"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId("edit-snippet-page")).not.toBeInTheDocument();
    });

    it("warns about unsaved content when leaving, and keeps the edit when the warning is cancelled", async () => {
      await setup({ snippet: { content: SNIPPET_CONTENT } });

      await userEvent.type(getEditor(), " WHERE id = 1");
      await userEvent.click(
        screen.getByRole("link", { name: "Other page link" }),
      );

      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByText("Discard your changes?"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Cancel" }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("edit-snippet-page")).toBeInTheDocument();
      expect(screen.queryByText("Other page")).not.toBeInTheDocument();
      expect(getEditor()).toHaveValue(`${SNIPPET_CONTENT} WHERE id = 1`);
    });

    it("reverts unsaved content when editing is cancelled", async () => {
      await setup({ snippet: { content: SNIPPET_CONTENT } });

      await userEvent.type(getEditor(), " WHERE id = 1");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(getEditor()).toHaveValue(SNIPPET_CONTENT);
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      expect(fetchMock.callHistory.called(/update-snippet/)).toBe(false);
    });

    it("saves the edited content", async () => {
      const { snippet } = await setup({
        snippet: { content: SNIPPET_CONTENT },
      });

      await userEvent.type(getEditor(), " WHERE id = 1");
      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeEnabled();
      await userEvent.click(saveButton);

      expect(
        await screen.findByText("Snippet content updated"),
      ).toBeInTheDocument();
      expect(await getUpdateRequestBodies(snippet.id)).toEqual([
        { content: `${SNIPPET_CONTENT} WHERE id = 1` },
      ]);
      expect(getEditor()).toHaveValue(`${SNIPPET_CONTENT} WHERE id = 1`);
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Save" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("keeps unsaved content when the name or description is edited, and saves it without reverting them", async () => {
      const { snippet } = await setup({
        snippet: {
          name: "Test snippet",
          content: `${SNIPPET_CONTENT} WHERE id = 1`,
          description: null,
        },
      });

      await userEvent.type(getEditor(), "1");

      const nameInput = screen.getByPlaceholderText("Name");
      await userEvent.type(nameInput, "1");
      await userEvent.tab();
      expect(
        await screen.findByText("Snippet name updated"),
      ).toBeInTheDocument();
      await waitForSnippetRefetch(snippet.id, 2);

      await userEvent.type(
        screen.getByPlaceholderText("No description"),
        "desc",
      );
      await userEvent.tab();
      expect(
        await screen.findByText("Snippet description updated"),
      ).toBeInTheDocument();
      await waitForSnippetRefetch(snippet.id, 3);

      expect(getEditor()).toHaveValue(`${SNIPPET_CONTENT} WHERE id = 11`);

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByText("Snippet content updated"),
      ).toBeInTheDocument();
      expect(await getUpdateRequestBodies(snippet.id)).toEqual([
        { name: "Test snippet1" },
        { description: "desc" },
        { content: `${SNIPPET_CONTENT} WHERE id = 11` },
      ]);
      await waitForSnippetRefetch(snippet.id, 4);
      expect(screen.getByPlaceholderText("Name")).toHaveValue("Test snippet1");
      expect(
        within(screen.getByTestId("edit-snippet-page")).getByText("desc"),
      ).toBeInTheDocument();
      expect(getEditor()).toHaveValue(`${SNIPPET_CONTENT} WHERE id = 11`);
    });
  });
});

function getEditor() {
  return screen.getByTestId("snippet-editor");
}

async function getUpdateRequestBodies(snippetId: number): Promise<unknown[]> {
  const calls = fetchMock.callHistory.calls(`update-snippet-${snippetId}`);
  return calls.map((call) => JSON.parse(String(call.options.body)));
}

async function waitForSnippetRefetch(snippetId: number, count: number) {
  await waitFor(() =>
    expect(
      fetchMock.callHistory.calls(`get-snippet-${snippetId}`),
    ).toHaveLength(count),
  );
  await act(() => fetchMock.callHistory.flush(true));
}
