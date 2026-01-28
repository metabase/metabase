import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupNativeQuerySnippetEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import type {
  EnterpriseSettings,
  NativeQuerySnippet,
} from "metabase-types/api";
import { createMockNativeQuerySnippet } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { EditSnippetPage } from "./EditSnippetPage";

type SetupOps = {
  snippet?: Partial<NativeQuerySnippet>;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = async ({ snippet = {}, remoteSyncType }: SetupOps) => {
  const mockSnippet = createMockNativeQuerySnippet(snippet);
  setupNativeQuerySnippetEndpoints({ snippets: [mockSnippet] });

  renderWithProviders(
    <Route component={EditSnippetPage} path="/snippets/:snippetId" />,
    {
      initialRoute: `/snippets/${mockSnippet.id}`,
      storeInitialState: createMockState({
        settings: mockSettings({
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
      }),
      withRouter: true,
    },
  );
  expect(await screen.findByTestId("edit-snippet-page")).toBeInTheDocument();
};

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

  describe("when remote sync is set to read-only", () => {
    beforeEach(async () => {
      await setup({
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
