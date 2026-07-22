import {
  type ParentedChatMessage,
  activeResponses,
  forkBoundaryAttemptIds,
} from "./message-tree";

function user(id: string, parentId: string | null): ParentedChatMessage {
  return {
    id,
    parent_message_id: parentId,
    role: "user",
    type: "text",
    message: id,
  };
}

function agent(id: string, parentId: string | null): ParentedChatMessage {
  return {
    id,
    parent_message_id: parentId,
    role: "agent",
    type: "text",
    message: id,
    externalId: id,
  };
}

const regenerated: ParentedChatMessage[] = [
  user("u1", null),
  agent("a1", "u1"),
  agent("a2", "u1"),
  user("u2", "a2"),
  agent("b1", "u2"),
];

describe("activeResponses", () => {
  it("defaults each branch to its newest reply", () => {
    const responses = activeResponses(regenerated, {}, { isSlack: false });

    expect(
      responses.flatMap(({ messages }) => messages.map(({ id }) => id)),
    ).toEqual(["u1", "a2", "u2", "b1"]);
  });

  it("follows a selected older reply and truncates everything downstream", () => {
    const responses = activeResponses(
      regenerated,
      { u1: "a1" },
      { isSlack: false },
    );

    expect(
      responses.flatMap(({ messages }) => messages.map(({ id }) => id)),
    ).toEqual(["u1", "a1"]);
  });

  it("marks a regenerated reply with its branch and alternatives", () => {
    const [prompt, reply] = activeResponses(
      regenerated,
      {},
      {
        isSlack: false,
      },
    );

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
      { isSlack: false },
    );

    expect(reply.branch).toBeNull();
  });

  it("groups a multi-message reply", () => {
    const messages = [
      user("u1", null),
      agent("a1", "u1"),
      agent("a2", "u1"),
      agent("a2-tool", "a2"),
      user("u2", "a2-tool"),
    ];
    const [, reply, followUp] = activeResponses(
      messages,
      {},
      { isSlack: false },
    );

    expect(reply.messages.map(({ id }) => id)).toEqual(["a2", "a2-tool"]);
    expect(reply.branch).toEqual({
      parentId: "u1",
      currentIndex: 1,
      replyIds: ["a1", "a2"],
    });
    expect(followUp.messages[0].id).toBe("u2");
  });

  describe("user-prompt branches (rewound errored turn)", () => {
    const rewoundAtRoot = [
      user("uErr", null),
      agent("aErr", "uErr"),
      user("uLive", null),
      agent("aLive", "uLive"),
    ];

    it("defaults to the newest root prompt and marks it with a branch on the prompt", () => {
      const [prompt, reply] = activeResponses(
        rewoundAtRoot,
        {},
        { isSlack: false },
      );

      expect(prompt.messages.map(({ id }) => id)).toEqual(["uLive"]);
      expect(prompt.branch).toEqual({
        parentId: "__root__",
        currentIndex: 1,
        replyIds: ["uErr", "uLive"],
      });
      expect(reply.messages.map(({ id }) => id)).toEqual(["aLive"]);
    });

    it("follows a selected older root prompt to reveal the rewound errored turn", () => {
      const responses = activeResponses(
        rewoundAtRoot,
        { __root__: "uErr" },
        { isSlack: false },
      );

      expect(
        responses.flatMap(({ messages }) => messages.map(({ id }) => id)),
      ).toEqual(["uErr", "aErr"]);
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

      const promptResponse = activeResponses(
        messages,
        {},
        { isSlack: false },
      ).find(({ messages }) => messages[0]?.id === "uLive");
      expect(promptResponse?.branch).toEqual({
        parentId: "a1",
        currentIndex: 1,
        replyIds: ["uErr", "uLive"],
      });

      const selected = activeResponses(
        messages,
        { a1: "uErr" },
        { isSlack: false },
      );
      expect(
        selected.flatMap(({ messages }) => messages.map(({ id }) => id)),
      ).toEqual(["u1", "a1", "uErr", "aErr"]);
    });
  });
});

describe("forkBoundaryAttemptIds", () => {
  it("returns every sibling attempt of a regenerated boundary turn", () => {
    expect(forkBoundaryAttemptIds(regenerated, "a1")).toEqual(
      new Set(["a1", "a2"]),
    );
    expect(forkBoundaryAttemptIds(regenerated, "a2")).toEqual(
      new Set(["a1", "a2"]),
    );
  });

  it("walks up a multi-message reply to find the turn head's siblings", () => {
    const messages = [
      user("u1", null),
      agent("a1", "u1"),
      agent("a2", "u1"),
      agent("a2-tool", "a2"),
    ];

    expect(forkBoundaryAttemptIds(messages, "a2-tool")).toEqual(
      new Set(["a1", "a2"]),
    );
  });

  it("returns the single id for an unregenerated boundary turn", () => {
    expect(
      forkBoundaryAttemptIds([user("u1", null), agent("a1", "u1")], "a1"),
    ).toEqual(new Set(["a1"]));
  });

  it("falls back to the boundary id when it can't be located", () => {
    expect(forkBoundaryAttemptIds(regenerated, "missing")).toEqual(
      new Set(["missing"]),
    );
  });
});
