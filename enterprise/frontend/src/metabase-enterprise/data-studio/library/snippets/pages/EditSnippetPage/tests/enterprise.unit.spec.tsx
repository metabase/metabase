import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

import { DEFAULT_EE_SETTINGS, setup } from "./setup";

describe("EditSnippetPage", () => {
  describe("when remote sync is set to read-only", () => {
    beforeEach(async () => {
      await setup({
        ...DEFAULT_EE_SETTINGS,
        snippet: {
          name: "Batman's snippet",
          description: "My snippet description",
        },
        remoteSyncType: "read-only",
      });
    });

    it("renders a disabled header name input", () => {
      expect(
        within(screen.getByTestId("snippet-header")).getByRole("textbox"),
      ).toBeDisabled();
    });

    it("renders a disabled code editor", () => {
      expect(screen.getByTestId("snippet-editor")).toBeDisabled();
    });

    it("renders a disabled description input", async () => {
      await userEvent.click(
        within(screen.getByTestId("edit-snippet-page")).getByText(
          "My snippet description",
        ),
      );
      expect(screen.getByPlaceholderText("No description")).toBeDisabled();
    });
  });
});
