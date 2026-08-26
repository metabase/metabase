import {
  createMockMetabotTextPart,
  createMockMetabotToolCallPart,
  createMockParentedMessage,
} from "__support__/server-mocks";
import type { MetabotMessage } from "metabase/metabot/state/types";

import { type ParentedMessage, activeResponses } from "./message-tree";

const user = (id: string, parentId: string | null) =>
  createMockParentedMessage(id, parentId, { role: "user" });

const agent = (
  id: string,
  parentId: string | null,
  overrides?: Partial<Omit<MetabotMessage, "id">>,
) => createMockParentedMessage(id, parentId, { ...overrides, role: "agent" });

const regenerated: ParentedMessage[] = [
  user("u1", null),
  agent("a1", "u1"),
  agent("a2", "u1"),
  user("u2", "a2"),
  agent("b1", "u2"),
];

const responseIds = (messages: ParentedMessage[]) =>
  activeResponses(messages, {}).map(({ message }) => message.id);

describe("activeResponses", () => {
  it("defaults each branch to its newest reply", () => {
    expect(responseIds(regenerated)).toEqual(["u1", "a2", "u2", "b1"]);
  });

  it("follows a selected older reply and truncates everything downstream", () => {
    const responses = activeResponses(regenerated, { u1: "a1" });

    expect(responses.map(({ message }) => message.id)).toEqual(["u1", "a1"]);
  });

  it("marks a regenerated reply with its branch and alternatives", () => {
    const [prompt, reply] = activeResponses(regenerated, {});

    expect(prompt.branch).toBeNull();
    expect(reply.branch).toEqual({
      parentId: "u1",
      currentIndex: 1,
      replyIds: ["a1", "a2"],
    });
  });

  it("leaves a single reply unbranched", () => {
    const [, reply] = activeResponses(
      [user("u1", null), agent("a1", "u1")],
      {},
    );

    expect(reply.branch).toBeNull();
  });

  it("keeps all parts in a row as one response", () => {
    const reply = agent("a1", "u1", {
      parts: [
        createMockMetabotToolCallPart({ id: "a1-tool" }),
        createMockMetabotTextPart({ id: "a1-text" }),
      ],
    });

    const [, response] = activeResponses([user("u1", null), reply], {});

    expect(response.message.id).toBe("a1");
    expect(response.message.parts.map(({ id }) => id)).toEqual([
      "a1-tool",
      "a1-text",
    ]);
  });

  describe("user-prompt branches (rewound errored turn)", () => {
    const rewoundAtRoot = [
      user("uErr", null),
      agent("aErr", "uErr"),
      user("uLive", null),
      agent("aLive", "uLive"),
    ];

    it("defaults to the newest root prompt and marks it with a branch on the prompt", () => {
      const [prompt, reply] = activeResponses(rewoundAtRoot, {});

      expect(prompt.message.id).toBe("uLive");
      expect(prompt.branch).toEqual({
        parentId: "__root__",
        currentIndex: 1,
        replyIds: ["uErr", "uLive"],
      });
      expect(reply.message.id).toBe("aLive");
    });

    it("follows a selected older root prompt to reveal the rewound errored turn", () => {
      const responses = activeResponses(rewoundAtRoot, { __root__: "uErr" });

      expect(responses.map(({ message }) => message.id)).toEqual([
        "uErr",
        "aErr",
      ]);
    });

    it("branches user prompts mid-thread too", () => {
      const messages = [
        user("u1", null),
        agent("a1", "u1"),
        user("uErr", "a1"),
        agent("aErr", "uErr"),
        user("uLive", "a1"),
        agent("aLive", "uLive"),
      ];

      const promptResponse = activeResponses(messages, {}).find(
        ({ message }) => message.id === "uLive",
      );
      expect(promptResponse?.branch).toEqual({
        parentId: "a1",
        currentIndex: 1,
        replyIds: ["uErr", "uLive"],
      });

      const selected = activeResponses(messages, { a1: "uErr" });
      expect(selected.map(({ message }) => message.id)).toEqual([
        "u1",
        "a1",
        "uErr",
        "aErr",
      ]);
    });
  });
});
