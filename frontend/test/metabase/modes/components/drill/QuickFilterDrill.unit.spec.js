import QuickFilterDrill from "metabase/modes/components/drill/QuickFilterDrill";
import { ORDERS } from "__support__/sample_database_fixture";

function setup({ question = ORDERS.question(), clicked } = {}) {
  return QuickFilterDrill({ question, clicked });
}

const NUMBER_AND_DATE_FILTERS = ["<", ">", "=", "!="];

describe("QuickFilterDrill", () => {
  it("should not be valid for top level actions", () => {
    const actions = setup({ question: ORDERS.question() });
    expect(actions).toHaveLength(0);
  });

  describe("numeric cells", () => {
    const CELL_VALUE = 42;
    const actions = setup({
      clicked: {
        column: ORDERS.TOTAL.column(),
        value: CELL_VALUE,
      },
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          filter: [operator, ["field", ORDERS.TOTAL.id, null], CELL_VALUE],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("joined numeric field cell", () => {
    const CELL_VALUE = 42;
    const joinedFieldRef = ["field", ORDERS.TOTAL.id, { "join-alias": "foo" }];
    const actions = setup({
      clicked: {
        column: ORDERS.TOTAL.column({ field_ref: joinedFieldRef }),
        value: CELL_VALUE,
      },
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          filter: [operator, joinedFieldRef, CELL_VALUE],
        });
        expect(card.display).toBe("table");
      });
    });
  });
});
