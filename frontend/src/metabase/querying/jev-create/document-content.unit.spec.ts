import { getJevDocumentContent } from "./document-content";

describe("getJevDocumentContent", () => {
  it("embeds each card in order", () => {
    let nextId = 0;
    const createNodeId = () => `node-${++nextId}`;

    expect(getJevDocumentContent([10, 20], createNodeId)).toEqual({
      type: "doc",
      content: [
        {
          type: "resizeNode",
          content: [{ type: "cardEmbed", attrs: { id: 10, _id: "node-1" } }],
        },
        {
          type: "resizeNode",
          content: [{ type: "cardEmbed", attrs: { id: 20, _id: "node-2" } }],
        },
      ],
    });
  });

  it("gives each embed a unique node id by default", () => {
    const { content = [] } = getJevDocumentContent([10, 10]);
    const ids = content.map((node) => node.content?.[0]?.attrs?._id);
    expect(new Set(ids).size).toBe(2);
  });
});
