import { getJevDashcardLayout } from "./dashboard-layout";

describe("getJevDashcardLayout", () => {
  it("places cards two per row with negative ids", () => {
    expect(getJevDashcardLayout([10, 20, 30])).toEqual([
      { id: -1, card_id: 10, col: 0, row: 0, size_x: 12, size_y: 6 },
      { id: -2, card_id: 20, col: 12, row: 0, size_x: 12, size_y: 6 },
      { id: -3, card_id: 30, col: 0, row: 6, size_x: 12, size_y: 6 },
    ]);
  });

  it("returns nothing for no cards", () => {
    expect(getJevDashcardLayout([])).toEqual([]);
  });
});
