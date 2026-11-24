import fetchMock from "fetch-mock";

import { act, render, screen, waitFor } from "__support__/ui";
import {
  createReadyMessage,
  createTokenMessage,
} from "metabase/embedding/permission-preview/messages";

import { PermissionPreviewFrame } from "./PermissionPreviewFrame";
import { addPreviewTokenHeader } from "./preview-requests";

jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("./PreviewContent", () => ({
  PreviewContent: ({ initialItem }: { initialItem: string }) => (
    <div>Preview of {initialItem}</div>
  ),
}));

const PARENT_ORIGIN = window.location.origin;

function setup() {
  const parent = { postMessage: jest.fn() };
  Object.defineProperty(window, "parent", {
    value: parent,
    configurable: true,
  });
  window.history.pushState(
    {},
    "",
    "/embed/permission-preview-content/dashboard/12",
  );
  render(<PermissionPreviewFrame />);
  return { parent };
}

function asWindow(parent: { postMessage: jest.Mock }) {
  // The frame only compares `event.source` with `window.parent`, which setup() replaces with this stand-in.
  return parent as unknown as MessageEventSource;
}

function receive({ data, origin, source }: MessageEventInit) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
  });
}

describe("PermissionPreviewFrame", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    Reflect.deleteProperty(window, "parent");
    window.fetch = originalFetch;
  });

  it("says where to start when it is opened on its own", () => {
    render(<PermissionPreviewFrame />);

    expect(
      screen.getByText(
        "Start a preview from Admin > Permissions > Preview access.",
      ),
    ).toBeInTheDocument();
  });

  it("asks its parent for the token, at its own origin only", () => {
    const { parent } = setup();

    expect(parent.postMessage).toHaveBeenCalledWith(
      createReadyMessage(),
      PARENT_ORIGIN,
    );
    expect(screen.queryByText(/Preview of/)).not.toBeInTheDocument();
  });

  it("opens the item of its path once the parent sends the token", async () => {
    const { parent } = setup();

    receive({
      data: createTokenMessage("mbpv_a"),
      origin: PARENT_ORIGIN,
      source: asWindow(parent),
    });

    expect(await screen.findByText("Preview of dashboard/12")).toBeVisible();
    await expect(
      addPreviewTokenHeader({ method: "GET", url: "/api/x", data: {} }),
    ).resolves.toEqual({
      headers: { "X-Metabase-Preview-Token": "mbpv_a" },
    });
  });

  it("ignores a token from another origin or another window", () => {
    const { parent } = setup();

    receive({
      data: createTokenMessage("mbpv_b"),
      origin: "https://evil.example",
      source: asWindow(parent),
    });
    receive({
      data: createTokenMessage("mbpv_b"),
      origin: PARENT_ORIGIN,
      source: window,
    });

    expect(screen.queryByText(/Preview of/)).not.toBeInTheDocument();
  });

  it("sends every fetch without cookies", async () => {
    setup();
    fetchMock.get("path:/api/ping", {});

    await window.fetch("/api/ping");

    await waitFor(() =>
      expect(
        fetchMock.callHistory.lastCall("path:/api/ping")?.options,
      ).toMatchObject({
        credentials: "omit",
      }),
    );
  });

  it("tells the person a write was refused because the preview is read-only", async () => {
    const { parent } = setup();
    receive({
      data: createTokenMessage("mbpv_a"),
      origin: PARENT_ORIGIN,
      source: asWindow(parent),
    });
    fetchMock.post("path:/api/card", {
      status: 403,
      body: {
        message: "A preview is read-only.",
        "error-code": "preview-read-only",
      },
    });

    await act(async () => {
      await window.fetch("/api/card", { method: "POST" });
    });

    expect(
      await screen.findByText(
        "This preview is read-only, so your change wasn't saved.",
      ),
    ).toBeVisible();
  });

  it("stays quiet about any other refusal", async () => {
    const { parent } = setup();
    receive({
      data: createTokenMessage("mbpv_a"),
      origin: PARENT_ORIGIN,
      source: asWindow(parent),
    });
    fetchMock.get("path:/api/secret", {
      status: 403,
      body: { message: "You don't have permissions to do that." },
    });

    await window.fetch("/api/secret");

    expect(
      screen.queryByText(
        "This preview is read-only, so your change wasn't saved.",
      ),
    ).not.toBeInTheDocument();
  });
});
