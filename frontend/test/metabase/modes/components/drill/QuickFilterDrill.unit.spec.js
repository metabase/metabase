import QuickFilterDrill from "metabase/modes/components/drill/QuickFilterDrill";
import { ORDERS, PEOPLE } from "__support__/sample_database_fixture";

function setup({ question = ORDERS.question(), clicked } = {}) {
  return QuickFilterDrill({ question, clicked });
}

const NUMBER_AND_DATE_FILTERS = ["<", ">", "=", "!="];

const OTHER_FILTERS = ["=", "!="];

describe("QuickFilterDrill", () => {
  it("should not be valid for top level actions", () => {
    const actions = setup({ question: ORDERS.question() });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid for PK cells", () => {
    const actions = setup({
      clicked: {
        column: ORDERS.ID.column(),
        value: 1,
      },
    });
    expect(actions).toHaveLength(0);
  });

  describe("FK cells", () => {
    const actions = setup({
      clicked: {
        column: ORDERS.PRODUCT_ID.column(),
        value: 1,
      },
    });

    it("should return only 'view this records' filter", () => {
      expect(actions).toMatchObject([{ name: "view-fks" }]);
    });

    it("should apply 'view this records' filter correctly", () => {
      const [action] = actions;
      const card = action.question().card();
      expect(card.dataset_query.query).toEqual({
        "source-table": ORDERS.id,
        filter: ["=", ["field", ORDERS.PRODUCT_ID.id, null], 1],
      });
    });
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

  describe("date-time cells", () => {
    const CELL_VALUE = new Date().toISOString();
    const actions = setup({
      clicked: {
        column: ORDERS.CREATED_AT.column(),
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
          filter: [operator, ["field", ORDERS.CREATED_AT.id, null], CELL_VALUE],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("string cells", () => {
    const CELL_VALUE = "Joe";
    const actions = setup({
      question: PEOPLE.question(),
      clicked: {
        column: PEOPLE.NAME.column(),
        value: CELL_VALUE,
      },
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": PEOPLE.id,
          filter: [operator, ["field", PEOPLE.NAME.id, null], CELL_VALUE],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("numeric cells, but not semantically numbers", () => {
    const CELL_VALUE = 12345;
    const actions = setup({
      question: PEOPLE.question(),
      clicked: {
        column: PEOPLE.ZIP.column(),
        value: CELL_VALUE,
      },
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": PEOPLE.id,
          filter: [operator, ["field", PEOPLE.ZIP.id, null], CELL_VALUE],
        });
        expect(card.display).toBe("table");
      });
    });
  });
});
