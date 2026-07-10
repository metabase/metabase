import {
  type ParentedChatMessage,
  activePath,
  activeResponses,
  indexChildrenByParent,
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

// A prompt with two agent replies (a1 older, a2 newest), then a follow-up prompt
// that branched off the newest reply.
const regenerated: ParentedChatMessage[] = [
  user("u1", null),
  agent("a1", "u1"),
  agent("a2", "u1"),
  user("u2", "a2"),
  agent("b1", "u2"),
];

describe("indexChildrenByParent", () => {
  it("groups children under their parent id, roots under null", () => {
    const index = indexChildrenByParent(regenerated);

    expect(index.get(null)).toEqual([user("u1", null)]);
    expect(index.get("u1")).toEqual([agent("a1", "u1"), agent("a2", "u1")]);
    expect(index.get("a2")).toEqual([user("u2", "a2")]);
  });
});

describe("activePath", () => {
  const index = indexChildrenByParent(regenerated);

  it("defaults each branch to its newest reply", () => {
    expect(activePath(index, {}).map((node) => node.id)).toEqual([
      "u1",
      "a2",
      "u2",
      "b1",
    ]);
  });

  it("follows a selected older reply and truncates everything downstream", () => {
    expect(activePath(index, { u1: "a1" }).map((node) => node.id)).toEqual([
      "u1",
      "a1",
    ]);
  });
});

describe("activeResponses", () => {
  const index = indexChildrenByParent(regenerated);

  it("marks a regenerated reply with its branch and alternatives", () => {
    const [prompt, reply] = activeResponses(index, {}, { isSlack: false });

    expect(prompt.branch).toBeNull();
    expect(reply.branch).toEqual({
      parentId: "u1",
      currentIndex: 1,
      siblingIds: ["a1", "a2"],
    });
  });

  it("leaves a single reply unbranched", () => {
    const [reply] = activeResponses(
      indexChildrenByParent([user("u1", null), agent("a1", "u1")]),
      {},
      { isSlack: false },
    );

    expect(reply.branch).toBeNull();
  });
});
