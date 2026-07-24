import userEvent from "@testing-library/user-event";

import { fireEvent, render, screen, waitFor } from "__support__/ui";

import type {
  DataAppDiagnosticPayload,
  DataAppDiagnosticsReport,
} from "../../types/diagnostics-channel";

import { DevToolbar } from "./DevToolbar";

// The toolbar is a pure reader of the dev server's feed: collection lives in the
// store + reporter, outside this component. So the tests drive it by serving
// feed responses, exactly as the dev server would.

let served: DataAppDiagnosticsReport;
let deleted: number;

const entry = (
  overrides: Partial<DataAppDiagnosticPayload> = {},
): DataAppDiagnosticPayload => ({
  eventId: 1,
  time: Date.parse("2026-01-01T10:00:00Z"),
  kind: "error",
  summary: "boom",
  detail: null,
  hint: null,
  alert: true,
  ...overrides,
});

const serve = (
  entries: DataAppDiagnosticPayload[],
  overrides: Partial<DataAppDiagnosticsReport> = {},
) => {
  served = {
    entries,
    connection: null,
    manifest: null,
    clients: 1,
    lastReportAt: 1,
    lastRebuildAt: 1,
    nextEventId: (entries.at(-1)?.eventId ?? 0) + 1,
    sessionId: "page-1",
    ...overrides,
  };
};

beforeEach(() => {
  deleted = 0;
  serve([]);

  jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
    if (init?.method === "DELETE") {
      deleted += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(served), { status: 200 }),
    );
  });
});

afterEach(() => jest.restoreAllMocks());

const getToggle = () => screen.getByRole("button", { name: /Diagnostics/ });

/** Render and wait for the first poll to land. */
const setup = async () => {
  render(<DevToolbar />);
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
};

/** Open the full panel — a single click, no intermediate popover. */
const open = async () => {
  await userEvent.click(getToggle());
};

describe("DevToolbar closed", () => {
  it("badges the count of entries the server marked as alerts", async () => {
    serve([
      entry({ eventId: 1, summary: "boom", alert: true }),
      entry({
        eventId: 2,
        kind: "sdk-call",
        summary: "GET /api/card/1 → 200",
        alert: false,
      }),
    ]);
    await setup();

    await waitFor(() =>
      expect(getToggle()).toHaveTextContent("⚠ Diagnostics (1)"),
    );
  });

  it("shows no count when there are no alerts", async () => {
    await setup();
    expect(getToggle()).toHaveTextContent(/^⚠ Diagnostics$/);
  });
});

describe("DevToolbar open", () => {
  it("opens the full panel with tabs on a single click", async () => {
    await setup();
    await open();

    // No intermediate popover: the tabs are there immediately, and the toggle
    // button is replaced by the panel.
    expect(screen.getByRole("tab", { name: "Errors" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Diagnostics/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No errors captured.")).toBeInTheDocument();
  });

  it("renders the server's summary, collapsed detail and hint", async () => {
    serve([
      entry({
        eventId: 1,
        summary: "TypeError: nope",
        detail: "    at App (src/App.tsx:1:1)",
        hint: "Fix the thing.",
      }),
    ]);
    await setup();
    await open();

    expect(screen.getByText("TypeError: nope")).toBeInTheDocument();
    expect(screen.getByRole("group")).not.toHaveAttribute("open");
    expect(
      screen.getByText(/at App \(src\/App\.tsx:1:1\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Fix the thing.")).toBeInTheDocument();
  });

  it("splits entries across their tabs by kind", async () => {
    serve([
      entry({ eventId: 1, kind: "error", summary: "plain error" }),
      entry({
        eventId: 2,
        kind: "blocked-network",
        summary: "Blocked fetch to evil.test",
      }),
      entry({
        eventId: 3,
        kind: "csp-violation",
        summary: "Content Security Policy (connect-src) blocked https://x",
        hint: "Add that URL's origin to allowed_hosts in data_app.yaml.",
      }),
    ]);
    await setup();
    await open();

    expect(screen.getByText("plain error")).toBeInTheDocument();
    expect(
      screen.queryByText("Blocked fetch to evil.test"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Blocked" }));

    expect(screen.getByText("Blocked fetch to evil.test")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add that URL's origin to allowed_hosts in data_app.yaml.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("plain error")).not.toBeInTheDocument();
  });

  it("filters the Queries tab to failed calls only", async () => {
    serve([
      entry({
        eventId: 1,
        kind: "sdk-call",
        summary: "POST /api/card/1/query → 202 (45ms)",
        alert: false,
      }),
      entry({
        eventId: 2,
        kind: "sdk-call",
        summary: "POST /api/dataset → 400 (12ms)",
        alert: true,
      }),
    ]);
    await setup();
    await open();
    await userEvent.click(screen.getByRole("tab", { name: "Queries" }));

    expect(screen.getByText(/api\/card\/1\/query/)).toBeInTheDocument();
    expect(screen.getByText(/Dev runs with an API key/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Failed only/ }),
    );

    expect(screen.getByText(/api\/dataset/)).toBeInTheDocument();
    expect(screen.queryByText(/api\/card\/1\/query/)).not.toBeInTheDocument();
  });

  it("renders the manifest status the feed carries", async () => {
    serve([], {
      manifest: {
        name: "Demo",
        bundlePath: "dist/index.js",
        bundlePathExists: false,
        allowedHosts: [],
        errors: ["path is required"],
        warnings: [],
        restartRequired: true,
      },
    });
    await setup();
    await open();
    await userEvent.click(screen.getByRole("tab", { name: "Manifest" }));

    expect(screen.getByText("path is required")).toBeInTheDocument();
    expect(screen.getByText(/allowed_hosts changed/)).toBeInTheDocument();
    expect(screen.getByText(/file not found/)).toBeInTheDocument();
  });

  it("renders the connection status the feed carries", async () => {
    serve([], {
      connection: {
        checkedAt: 1,
        metabaseUrl: "http://localhost:3000",
        reachable: true,
        sdkVersion: "0.64.0",
        error: "Could not reach http://localhost:3000.",
      },
    });
    await setup();
    await open();
    await userEvent.click(screen.getByRole("tab", { name: "Connection" }));

    expect(screen.getByText("http://localhost:3000")).toBeInTheDocument();
    expect(
      screen.getByText("Could not reach http://localhost:3000."),
    ).toBeInTheDocument();
  });

  it("says so when the dev server is unreachable, rather than looking healthy", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("connection refused"));

    render(<DevToolbar />);
    await open();

    expect(
      await screen.findByText(/Can't reach the dev server/),
    ).toBeInTheDocument();
  });

  it("says so when no preview tab is connected", async () => {
    serve([], { clients: 0 });
    await setup();
    await open();

    expect(screen.getByText(/No preview tab is connected/)).toBeInTheDocument();
  });

  it("clears through the endpoint so every reader is cleared", async () => {
    serve([entry({ eventId: 1, summary: "boom" })]);
    await setup();
    await open();
    expect(await screen.findByText("boom")).toBeInTheDocument();

    serve([]);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(deleted).toBe(1));
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("closes back to the toggle when Close is clicked", async () => {
    await setup();
    await open();
    expect(screen.getByRole("tab", { name: "Errors" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("tab", { name: "Errors" }),
    ).not.toBeInTheDocument();
    expect(getToggle()).toBeInTheDocument();
  });

  it("resizes the panel by dragging its top edge", async () => {
    await setup();
    await open();

    const handle = screen.getByRole("separator", {
      name: /Resize diagnostics panel/,
    });
    const panel = screen.getByTestId("dev-toolbar-panel");
    const before = parseInt(panel.style.height, 10);

    // Drag the top edge up by 120px — the bottom-docked panel grows.
    fireEvent.mouseDown(handle, { clientY: 400 });
    fireEvent.mouseMove(window, { clientY: 280 });
    fireEvent.mouseUp(window);

    expect(parseInt(panel.style.height, 10)).toBe(before + 120);
  });
});

// Guard the contract this refactor rests on: the panel must not reach into the
// in-page store, or it would drift from what an external reader sees. The read
// mechanics (mirror the report, drop stale/cleared reads) live in
// `lib/use-diagnostics-feed.unit.spec.ts`.
describe("DevToolbar data source", () => {
  it("reads the diagnostics endpoint", async () => {
    await setup();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/__data-app/diagnostics"),
    );
  });

  it("reads on a nudge rather than on a timer when the dev server can push", async () => {
    const listeners = new Set<() => void>();
    const subscribe = (onChange: () => void) => {
      listeners.add(onChange);

      return () => listeners.delete(onChange);
    };

    render(<DevToolbar subscribe={subscribe} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    // Left alone it must stay quiet: there is no timer, so a second read without
    // a nudge would mean it is polling when it should only be pushed.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    listeners.forEach((listener) => listener());
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });
});
