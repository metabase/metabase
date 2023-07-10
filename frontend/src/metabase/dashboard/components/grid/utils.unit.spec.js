import { sortCardsForMobile } from "./utils";

describe("Dashcard > grid > utils", () => {
  describe("sortCardsForMobile", () => {
    it("should sort cards by y position first", () => {
      const a = { id: "top", y: 1, x: 3 };
      const b = { id: "middle", y: 2, x: 2 };
      const c = { id: "bottom", y: 3, x: 1 };

      const result = [b, a, c].sort(sortCardsForMobile);
      expect(result).toEqual([a, b, c]);
    });

    it("should sort cards by x position if y position is the same", () => {
      const a = { id: "left", y: 5, x: 1 };
      const b = { id: "middle", y: 5, x: 2 };
      const c = { id: "right", y: 5, x: 3 };

      const result = [c, a, b].sort(sortCardsForMobile);
      expect(result).toEqual([a, b, c]);
    });

    it("should sort cards by x and y positions", () => {
      const a = { id: "top", y: 1, x: 3 };
      const b = { id: "middle", y: 2, x: 2 };
      const c = { id: "bottom", y: 3, x: 1 };

      const d = { id: "left", y: 5, x: 1 };
      const e = { id: "middle", y: 5, x: 2 };
      const f = { id: "right", y: 5, x: 3 };

      const result = [f, d, c, a, b, e].sort(sortCardsForMobile);
      expect(result).toEqual([a, b, c, d, e, f]);
    });
  });
});
