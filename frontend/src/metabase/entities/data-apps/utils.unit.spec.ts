import { createMockDataAppPage } from "metabase-types/api/mocks";
import { getDataAppHomePageId } from "./utils";

describe("data app utils", () => {
  describe("getDataAppHomePageId", () => {
    it("returns fist page in alphabetical order", () => {
      const page1 = createMockDataAppPage({ id: 1, name: "A" });
      const page2 = createMockDataAppPage({ id: 2, name: "B" });
      const page3 = createMockDataAppPage({ id: 3, name: "C" });

      expect(getDataAppHomePageId([page2, page1, page3])).toEqual(page1.id);
    });

    it("returns undefined when there're no pages", () => {
      expect(getDataAppHomePageId([])).toBeUndefined();
    });
  });
});
