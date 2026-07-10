import { type ParentedChatMessage, activeResponses } from "./message-tree";

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
});
