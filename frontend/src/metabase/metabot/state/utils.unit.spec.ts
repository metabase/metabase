import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import type { MetabotMessage, MetabotMessagePart } from "./types";
import { getServerErrorDisplay, keepLatestGeneratedCards } from "./utils";

describe("getServerErrorDisplay", () => {
  it.each([
    "ai_usage_limit_reached",
    "ai_provider_billing",
    "ai_provider_rate_limit",
    "ai_provider_auth",
    "ai_provider_unavailable",
    "ai_provider_context_full",
  ])("shows the server message for %s", (type) => {
    expect(getServerErrorDisplay({ type, message: "copy" })).toEqual({
      type: "message",
      message: "copy",
    });
  });

  it("shows nothing for an unknown code", () => {
    expect(
      getServerErrorDisplay({
        type: "java.lang.RuntimeException",
        message: "boom",
      }),
    ).toBeUndefined();
  });

  it("shows nothing without a message", () => {
    expect(
      getServerErrorDisplay({ type: "ai_provider_context_full" }),
    ).toBeUndefined();
  });
});

describe("keepLatestGeneratedCards", () => {
  const datasetQuery = Lib.createTestJsQuery(
    SAMPLE_PROVIDER,
    DEFAULT_TEST_QUERY,
  );

  const cardPart = (id: string, title: string): MetabotMessagePart => {
    const card: GeneratedCard = {
      type: "card",
      id,
      title,
      query: { id: `query-${id}`, query: datasetQuery },
    };
    return {
      id: `part-${title}`,
      role: "agent",
      type: "data_part",
      part: { type: "data-generated_entity", data: card },
    };
  };

  const textPart = (message: string): MetabotMessagePart => ({
    id: `part-${message}`,
    role: "agent",
    type: "text",
    message,
  });

  const agentMessage = (
    id: string,
    parts: MetabotMessagePart[],
  ): MetabotMessage => ({
    id,
    role: "agent",
    parts,
    status: { type: "done" },
  });

  const partIds = (messages: MetabotMessage[]) =>
    messages.map((message) => message.parts.map((part) => part.id));

  it("keeps only the last version of a chart across messages", () => {
    const messages = [
      agentMessage("m1", [cardPart("chart-a", "v1"), textPart("built it")]),
      agentMessage("m2", [cardPart("chart-a", "v2")]),
    ];

    expect(partIds(keepLatestGeneratedCards(messages))).toEqual([
      ["part-built it"],
      ["part-v2"],
    ]);
  });

  it("keeps every chart that has its own id", () => {
    const messages = [
      agentMessage("m1", [cardPart("chart-a", "a"), cardPart("chart-b", "b")]),
    ];

    expect(partIds(keepLatestGeneratedCards(messages))).toEqual([
      ["part-a", "part-b"],
    ]);
  });
});
