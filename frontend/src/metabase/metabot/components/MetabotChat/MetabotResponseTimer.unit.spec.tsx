import { act, renderWithProviders, screen } from "__support__/ui";
import type { MetabotMessage } from "metabase/metabot/state";

import {
  MetabotResponseTimer,
  getConversationResponseTimings,
  getPromptResponseTimings,
} from "./MetabotResponseTimer";

const userMessage = (id: string): MetabotMessage => ({
  id,
  role: "user",
  parts: [],
  status: { type: "done" },
});

const agentMessage = (
  id: string,
  responseStartedAtMs?: number,
  responseEndedAtMs?: number,
  firstChartAtMs?: number,
): MetabotMessage => ({
  id,
  role: "agent",
  parts: [],
  status: { type: "done" },
  responseStartedAtMs,
  responseEndedAtMs,
  firstChartAtMs,
});

const timing = (
  startedAtMs: number,
  endedAtMs?: number,
  firstChartAtMs?: number,
) => ({ startedAtMs, endedAtMs, firstChartAtMs });

const MESSAGES = [
  userMessage("u1"),
  agentMessage("a1", 0, 2_000),
  agentMessage("a2", 3_000, 4_500, 4_000),
  userMessage("u2"),
  agentMessage("a3", 10_000, 11_000),
  agentMessage("a4"),
];

describe("response timings", () => {
  it("collects a prompt's responses up to the next prompt", () => {
    expect(getPromptResponseTimings(MESSAGES, 0)).toEqual([
      timing(0, 2_000),
      timing(3_000, 4_500, 4_000),
    ]);
    expect(getPromptResponseTimings(MESSAGES, 3)).toEqual([
      timing(10_000, 11_000),
    ]);
  });

  it("collects every timed response in the conversation", () => {
    expect(getConversationResponseTimings(MESSAGES)).toHaveLength(3);
  });
});

describe("MetabotResponseTimer", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("sums finished responses", () => {
    renderWithProviders(
      <MetabotResponseTimer timings={getPromptResponseTimings(MESSAGES, 0)} />,
    );
    expect(screen.getByTestId("metabot-response-timer")).toHaveTextContent(
      "3.5s",
    );
  });

  it("counts up while a response is in flight", () => {
    jest.useFakeTimers({ now: 5_000 });
    renderWithProviders(
      <MetabotResponseTimer timings={[timing(0, 2_000), timing(5_000)]} />,
    );
    expect(screen.getByTestId("metabot-response-timer")).toHaveTextContent(
      "2.0s",
    );

    act(() => {
      jest.advanceTimersByTime(1_500);
    });
    expect(screen.getByTestId("metabot-response-timer")).toHaveTextContent(
      "3.5s",
    );
  });

  it("shows time to the first chart, counting across earlier responses", () => {
    renderWithProviders(
      <MetabotResponseTimer
        timings={getPromptResponseTimings(MESSAGES, 0)}
        showTimeToFirstChart
      />,
    );
    expect(screen.getByTestId("metabot-first-chart-timer")).toHaveTextContent(
      "3.0s",
    );
  });

  it("counts time to first chart up while waiting, then stops at the chart", () => {
    jest.useFakeTimers({ now: 1_000 });
    const { rerender } = renderWithProviders(
      <MetabotResponseTimer timings={[timing(0)]} showTimeToFirstChart />,
    );
    expect(screen.getByTestId("metabot-first-chart-timer")).toHaveTextContent(
      "1.0s",
    );

    rerender(
      <MetabotResponseTimer
        timings={[timing(0, undefined, 1_500)]}
        showTimeToFirstChart
      />,
    );
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(screen.getByTestId("metabot-first-chart-timer")).toHaveTextContent(
      "1.5s",
    );
    expect(screen.getByTestId("metabot-response-timer")).toHaveTextContent(
      "3.0s",
    );
  });

  it("hides time to first chart when the response finished without one", () => {
    renderWithProviders(
      <MetabotResponseTimer
        timings={[timing(0, 2_000)]}
        showTimeToFirstChart
      />,
    );
    expect(
      screen.queryByTestId("metabot-first-chart-timer"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing without timed responses", () => {
    renderWithProviders(<MetabotResponseTimer timings={[]} />);
    expect(
      screen.queryByTestId("metabot-response-timer"),
    ).not.toBeInTheDocument();
  });
});
