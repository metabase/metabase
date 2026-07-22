import userEvent from "@testing-library/user-event";

import { act, render, screen } from "__support__/ui";

import { DevToolbar } from "./DevToolbar";
import { devDiagnostics } from "./diagnostics";

const recordError = (message: string) => {
  act(() => {
    console.error(message);
  });
};

let originalConsoleError: typeof console.error;

beforeAll(() => {
  originalConsoleError = console.error;
  console.error = () => {};
  devDiagnostics.install();
});

afterAll(() => {
  console.error = originalConsoleError;
});

beforeEach(() => {
  devDiagnostics.clear();
});

const getToggle = () => screen.getByRole("button", { name: /Diagnostics/ });

describe("DevToolbar", () => {
  it("renders a collapsed diagnostics toggle with no count when there are no errors", () => {
    render(<DevToolbar />);

    expect(getToggle()).toHaveTextContent(/^⚠ Diagnostics$/);
    expect(screen.queryByText("Data app diagnostics")).not.toBeInTheDocument();
  });

  it("opens the panel showing the empty state, then closes via the toggle", async () => {
    render(<DevToolbar />);

    await userEvent.click(getToggle());
    expect(screen.getByText("Data app diagnostics")).toBeInTheDocument();
    expect(screen.getByText("No errors captured.")).toBeInTheDocument();

    await userEvent.click(getToggle());
    expect(screen.queryByText("Data app diagnostics")).not.toBeInTheDocument();
  });

  it("shows the captured count and lists entries newest first", async () => {
    render(<DevToolbar />);

    recordError("first error");
    recordError("second error");

    expect(getToggle()).toHaveTextContent("⚠ Diagnostics (2)");

    await userEvent.click(getToggle());

    const messages = screen.getAllByText(/error$/);
    expect(messages[0]).toHaveTextContent("second error");
    expect(messages[1]).toHaveTextContent("first error");
  });

  it("clears entries when Clear is clicked, leaving the panel open", async () => {
    render(<DevToolbar />);
    recordError("boom");

    await userEvent.click(getToggle());
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByText("No errors captured.")).toBeInTheDocument();
    expect(getToggle()).toHaveTextContent(/^⚠ Diagnostics$/);
  });

  it("leaves successful requests off the badge and out of the panel", async () => {
    render(<DevToolbar />);
    act(() => {
      devDiagnostics.record({
        kind: "sdk-call",
        method: "GET",
        endpoint: "/api/card/1",
        status: 200,
        durationMs: 12,
      });
    });

    // Every request lands in the collector now. Counting them would warn about
    // a page that is working.
    expect(getToggle()).toHaveTextContent(/^⚠ Diagnostics$/);

    await userEvent.click(getToggle());
    expect(screen.getByText("No errors captured.")).toBeInTheDocument();
  });

  it("still badges a request that failed", async () => {
    render(<DevToolbar />);
    act(() => {
      devDiagnostics.record({
        kind: "sdk-call",
        method: "POST",
        endpoint: "/api/dataset",
        status: 400,
        durationMs: 8,
        error: "Table does not exist",
      });
    });

    expect(getToggle()).toHaveTextContent("⚠ Diagnostics (1)");

    await userEvent.click(getToggle());
    expect(screen.getByText(/Table does not exist/)).toBeInTheDocument();
  });

  it("closes the panel when Close is clicked", async () => {
    render(<DevToolbar />);

    await userEvent.click(getToggle());
    expect(screen.getByText("Data app diagnostics")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Data app diagnostics")).not.toBeInTheDocument();
  });
});
