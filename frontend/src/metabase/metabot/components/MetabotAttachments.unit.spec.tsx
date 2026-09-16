import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { act, fireEvent, screen, waitFor, within } from "__support__/ui";
import { MetabotAsk } from "metabase/metabot/components/MetabotAsk";
import { MetabotChat } from "metabase/metabot/components/MetabotChat";
import { setProfileOverride } from "metabase/metabot/state";
import { MAX_UPLOAD_SIZE } from "metabase/redux/uploads";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import {
  createTestMetabotState,
  enterChatMessage,
  erroredResponse,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  testConversationId,
  whoIsYourFavoriteResponse,
} from "../tests/utils";

const uploadedModel = (id: number) =>
  new Response(JSON.stringify(id), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const file = (name = "birds.csv") =>
  new File(["bird,count\nrobin,3"], name, { type: "text/csv" });

function setupAttachments({
  enabled = true,
  canUpload = true,
  fullPage = false,
} = {}) {
  const result = setup({
    ui: fullPage ? (
      <MetabotAsk />
    ) : (
      <MetabotChat conversationId={testConversationId("omnibot")} />
    ),
    metabotInitialState: createTestMetabotState(),
    currentUser: createMockUser({ personal_collection_id: 7 }),
    storeInitialState: {
      settings: mockSettings({
        "llm-metabot-configured?": true,
        "uploads-settings": {
          db_id: enabled ? 1 : null,
          schema_name: "public",
          table_prefix: null,
        },
      }),
    },
  });
  fetchMock.modifyRoute("database-list", {
    response: { data: [createMockDatabase({ id: 1, can_upload: canUpload })] },
  });
  return result;
}

async function attach(files: File[] = [file()]) {
  await userEvent.click(
    await screen.findByRole("button", { name: "More actions" }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: /Add attachments/ }),
  );
  const input = screen.getByLabelText("Attach files", { selector: "input" });
  await userEvent.upload(input, files);
}

describe("Metabot attachments", () => {
  it("hides all attachment controls when uploads are disabled by admins", () => {
    setupAttachments({ enabled: false });
    expect(
      screen.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Attach files", { selector: "input" }),
    ).not.toBeInTheDocument();
  });

  it("hides the actions menu when the user cannot upload", async () => {
    setupAttachments({ canUpload: false });
    await waitFor(() =>
      expect(fetchMock.callHistory.called("database-list")).toBe(true),
    );
    expect(
      screen.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
  });

  it("hides attachments for SQL conversations", () => {
    const { store } = setupAttachments();
    act(() =>
      store.dispatch(
        setProfileOverride({
          conversationId: testConversationId("omnibot"),
          profile: "sql",
        }),
      ),
    );
    expect(
      screen.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
  });

  it("stages and removes files without importing", async () => {
    setupAttachments();
    await attach();
    expect(screen.getByText("birds.csv")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/upload/csv")).toHaveLength(0);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove birds.csv" }),
    );
    expect(screen.queryByText("birds.csv")).not.toBeInTheDocument();
    expect(screen.getByTestId("metabot-send-message")).toBeDisabled();
  });

  it.each([false, true])(
    "imports a file-only message into the personal collection (full page: %s)",
    async (fullPage) => {
      setupAttachments({ fullPage });
      fetchMock.post("path:/api/upload/csv", uploadedModel(123));
      const agent = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
      await attach();
      const append = jest.spyOn(FormData.prototype, "append");
      await userEvent.click(screen.getByTestId("metabot-send-message"));
      expect(await lastReqBody(agent)).toMatchObject({
        message: "",
        attachments: [
          { card_id: 123, filename: "birds.csv", media_type: "text/csv" },
        ],
      });
      expect(append).toHaveBeenCalledWith("collection_id", "7");
      append.mockRestore();
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Remove birds.csv" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("link", { name: /birds.csv/ })).toHaveAttribute(
        "href",
        "/model/123",
      );
    },
  );

  it.each([false, true])(
    "clears the prompt and attachments before the response arrives (full page: %s)",
    async (fullPage) => {
      setupAttachments({ fullPage });
      fetchMock.post("path:/api/upload/csv", uploadedModel(123));
      const agent = mockAgentEndpoint({
        events: whoIsYourFavoriteResponse,
        waitForResponse: true,
      });
      await attach();
      await enterChatMessage("Count birds");
      try {
        expect(await lastReqBody(agent)).toMatchObject({
          message: "Count birds",
          attachments: [{ card_id: 123 }],
        });
        expect(screen.getByTestId("metabot-chat-input")).toHaveTextContent(
          /^$/,
        );
        expect(
          screen.queryByRole("button", { name: "Remove birds.csv" }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /birds.csv/ })).toHaveAttribute(
          "href",
          "/model/123",
        );
      } finally {
        await act(async () => agent.sendResponse());
      }
    },
  );

  it("keeps successful imports while retrying failed files", async () => {
    setupAttachments();
    fetchMock.postOnce("path:/api/upload/csv", uploadedModel(123), {
      name: "first-upload",
    });
    fetchMock.post(
      "path:/api/upload/csv",
      { status: 400, body: { message: "Invalid CSV" } },
      { name: "second-upload" },
    );
    const agent = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    await attach([file(), file("owls.tsv")]);
    await enterChatMessage("Count each bird");
    expect(await screen.findByText("Invalid CSV")).toBeInTheDocument();
    expect(agent).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /birds.csv/ })).toHaveAttribute(
      "href",
      "/model/123",
    );
    fetchMock.modifyRoute("second-upload", {
      response: uploadedModel(124),
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await userEvent.click(screen.getByTestId("metabot-send-message"));
    expect(await lastReqBody(agent)).toMatchObject({
      message: "Count each bird",
      attachments: [
        { card_id: 123 },
        { card_id: 124, media_type: "text/tab-separated-values" },
      ],
    });
    expect(fetchMock.callHistory.calls("first-upload")).toHaveLength(1);
    expect(fetchMock.callHistory.calls("second-upload")).toHaveLength(2);
  });

  it("retains saved files after an agent failure without importing twice", async () => {
    setupAttachments();
    fetchMock.post("path:/api/upload/csv", uploadedModel(123));
    mockAgentEndpoint({ events: erroredResponse });
    await attach();
    await enterChatMessage("Count birds");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove birds.csv" }),
      ).toBeEnabled(),
    );
    const agent = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    await userEvent.click(screen.getByTestId("metabot-send-message"));
    expect(await lastReqBody(agent)).toMatchObject({
      attachments: [{ card_id: 123 }],
    });
    expect(fetchMock.callHistory.calls("path:/api/upload/csv")).toHaveLength(1);
  });

  it("does not automatically repeat an upload whose result is unknown", async () => {
    setupAttachments();
    fetchMock.post("path:/api/upload/csv", {
      throws: new TypeError("Failed to fetch"),
    });
    await attach();
    await userEvent.click(screen.getByTestId("metabot-send-message"));
    expect(
      await screen.findByText(/This file may have been saved/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open personal collection" }),
    ).toHaveAttribute("href", "/collection/7");
    await userEvent.click(screen.getByTestId("metabot-send-message"));
    expect(fetchMock.callHistory.calls("path:/api/upload/csv")).toHaveLength(1);
  });

  it("accepts dropped and pasted files but rejects unsupported and oversized files", async () => {
    setupAttachments();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "More actions" }),
      ).toBeEnabled(),
    );
    const editor = screen.getByTestId("metabot-chat-input");
    fireEvent.drop(editor, {
      dataTransfer: { files: [file()], types: ["Files"] },
    });
    fireEvent.paste(editor, { clipboardData: { files: [file("owls.tsv")] } });
    expect(screen.getAllByTestId("metabot-attachment")).toHaveLength(2);
    fireEvent.drop(editor, { dataTransfer: { files: [file("birds.xlsx")] } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose CSV or TSV files",
    );
    const oversized = file("big.csv");
    Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_SIZE + 1 });
    fireEvent.drop(editor, { dataTransfer: { files: [oversized] } });
    expect(screen.getAllByTestId("metabot-attachment")).toHaveLength(2);
    fireEvent.drop(editor, {
      dataTransfer: { files: Array.from({ length: 4 }, () => file()) },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("up to 5 files");
  });

  it("submits the uploaded source once and keeps its card in later turns", async () => {
    setupAttachments();
    fetchMock.post("path:/api/upload/csv", uploadedModel(123));
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    await attach();
    await enterChatMessage("Count birds");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove birds.csv" }),
      ).not.toBeInTheDocument(),
    );
    const agent = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    await enterChatMessage("Now group by month");
    expect(await lastReqBody(agent)).not.toHaveProperty("attachments");
    const messages = screen.getAllByTestId("metabot-chat-message");
    expect(
      within(messages[0]).getByRole("link", { name: /birds.csv/ }),
    ).toBeInTheDocument();
  });
});
