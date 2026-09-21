import { createRef } from "react";

import { render, screen } from "__support__/ui";
import type { Log } from "metabase-types/api";

import { LogsViewer } from "./LogsViewer";

const createLog = (log: Partial<Log> = {}): Log => ({
  timestamp: "2024-01-10T21:21:58.597Z",
  level: "DEBUG",
  fqns: "metabase.server.middleware.log",
  msg: "GET /api/collection/root 200",
  exception: null,
  process_uuid: "uuid-1",
  ...log,
});

describe("LogsViewer", () => {
  it("renders each log line (level, namespace, message)", () => {
    render(<LogsViewer logs={[createLog({ msg: "hello world" })]} />);

    const region = screen.getByRole("region");
    expect(region).toHaveTextContent("DEBUG");
    expect(region).toHaveTextContent("metabase.server.middleware.log");
    expect(region).toHaveTextContent("hello world");
  });

  it("appends exception stack frames after the message", () => {
    render(
      <LogsViewer
        logs={[
          createLog({
            msg: "boom",
            exception: [
              "java.lang.NullPointerException",
              "  at Foo.bar(Foo.java:1)",
            ],
          }),
        ]}
      />,
    );

    const region = screen.getByRole("region");
    expect(region).toHaveTextContent(
      "boom java.lang.NullPointerException at Foo.bar(Foo.java:1)",
    );
  });

  it("prefixes each line with its process UUID when there are multiple processes (default process = ALL)", () => {
    render(
      <LogsViewer
        logs={[
          createLog({ process_uuid: "uuid-1", msg: "from one" }),
          createLog({ process_uuid: "uuid-2", msg: "from two" }),
        ]}
      />,
    );

    const region = screen.getByRole("region");
    expect(region).toHaveTextContent("[uuid-1]");
    expect(region).toHaveTextContent("[uuid-2]");
  });

  it("does not prefix the process UUID when only one process is present", () => {
    render(<LogsViewer logs={[createLog({ process_uuid: "uuid-1" })]} />);

    expect(screen.getByRole("region")).not.toHaveTextContent("[uuid-1]");
  });

  it("shows logs only for the selected process without prefixing", () => {
    render(
      <LogsViewer
        processUUID="uuid-1"
        logs={[createLog({ process_uuid: "uuid-1", msg: "kept" })]}
        processUUIDs={["uuid-1", "uuid-2"]}
      />,
    );

    const region = screen.getByRole("region");
    expect(region).toHaveTextContent("kept");
    expect(region).not.toHaveTextContent("[uuid-1]");
  });

  it("uses the processUUIDs override to decide prefixing rather than the UUIDs present in logs", () => {
    render(
      <LogsViewer
        logs={[createLog({ process_uuid: "uuid-1", msg: "solo" })]}
        processUUIDs={["uuid-1", "uuid-2"]}
      />,
    );

    expect(screen.getByRole("region")).toHaveTextContent("[uuid-1]");
  });

  it("falls back to emptyMessage when there are no logs", () => {
    render(<LogsViewer logs={[]} emptyMessage="Nothing here" />);

    expect(screen.getByRole("region")).toHaveTextContent("Nothing here");
  });

  it("exposes a focusable, named region and merges className / rest props", () => {
    render(
      <LogsViewer
        logs={[createLog()]}
        className="custom-class"
        aria-label="Logs output"
        data-testid="logs-viewer"
      />,
    );

    const region = screen.getByRole("region", { name: "Logs output" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("custom-class");
    expect(region).toHaveAttribute("data-testid", "logs-viewer");
  });

  it("forwards the ref to the scrollable region element", () => {
    const ref = createRef<HTMLDivElement>();
    render(<LogsViewer ref={ref} logs={[createLog()]} />);

    expect(ref.current).toBe(screen.getByRole("region"));
  });
});
