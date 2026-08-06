import { appendUniqueItems } from "./useUsageMetadataList";

describe("appendUniqueItems", () => {
  it("deduplicates IDs when mutable queue offsets overlap", () => {
    const firstPage = [
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
    ];
    const overlappingPage = [
      { id: 2, name: "Second duplicate" },
      { id: 3, name: "Third" },
    ];

    expect(
      appendUniqueItems(firstPage, overlappingPage, (item) => item.id),
    ).toEqual([
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
      { id: 3, name: "Third" },
    ]);
  });
});
