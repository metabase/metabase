import {
  createMockDataApp,
  createMockDataAppPage,
} from "metabase-types/api/mocks";
import { getDataAppHomePageId } from "./utils";

describe("data app utils", () => {
  const dataAppWithoutHomepage = createMockDataApp({ dashboard_id: null });
  const dataAppWithHomepage = createMockDataApp({ dashboard_id: 3 });

  const page1 = createMockDataAppPage({ id: 1, name: "A" });
  const page2 = createMockDataAppPage({ id: 2, name: "B" });
  const page3 = createMockDataAppPage({ id: 3, name: "C" });
  const pages = [page1, page2, page3];

  describe("getDataAppHomePageId", () => {
    describe("with explicit homepage", () => {
      it("returns data app's dashboard_id", () => {
        expect(getDataAppHomePageId(dataAppWithHomepage, pages)).toEqual(
          dataAppWithHomepage.dashboard_id,
        );
      });

      it("returns data app's dashboard_id even if page list is empty", () => {
        expect(getDataAppHomePageId(dataAppWithHomepage, [])).toEqual(
          dataAppWithHomepage.dashboard_id,
        );
      });
    });

    describe("without explicit homepage", () => {
      it("returns fist page in alphabetical order", () => {
        expect(getDataAppHomePageId(dataAppWithoutHomepage, pages)).toEqual(
          page1.id,
        );
      });

      it("returns undefined when there're no pages", () => {
        expect(
          getDataAppHomePageId(dataAppWithoutHomepage, []),
        ).toBeUndefined();
      });
    });
  });
});
