import Field from "metabase-lib/lib/metadata/Field";

import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

import {
  getValueFromFields,
  syncQueryParamsWithURL,
} from "metabase/parameters/components/Parameters/syncQueryParamsWithURL";

describe("Parameters", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("syncQueryParamsWithURL", () => {
    const setParameterValue = jest.fn();

    describe("for internal questions", () => {
      describe("when parameters length is 0", () => {
        const props = {
          commitImmediately: true,
          parameters: [],
          query: {
            createdAt: "2021",
          },
          setParameterValue,
        };

        it("does not call setParameterValue", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).not.toHaveBeenCalled();
        });
      });

      describe("when query has no key that matches a parameter slug", () => {
        const props = {
          commitImmediately: true,
          parameters: [
            {
              id: "id",
              slug: "slugNotKeyInQuery",
            },
          ],
          query: {
            createdAt: "2021",
          },
          setParameterValue,
        };

        it("does not call setParameterValue", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).not.toHaveBeenCalled();
        });
      });

      describe("when parameters length is 1", () => {
        const props = {
          commitImmediately: true,
          parameters: [
            {
              id: "id",
              slug: "createdAt",
            },
          ],
          query: {
            createdAt: "2021",
          },
          setParameterValue,
        };

        it("calls setParameterValue once", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledTimes(1);
        });

        it("calls setParameterValue with parameters.id and the value for query key ", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledWith("id", "2021");
        });
      });

      describe("when parameters length is 2", () => {
        const props = {
          commitImmediately: true,
          parameters: [
            {
              id: "id1",
              slug: "createdAt",
            },
            {
              id: "id2",
              slug: "state",
            },
          ],

          query: {
            createdAt: "2021",
            state: "CA",
          },
          setParameterValue,
        };

        it("calls setParameterValue twice", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledTimes(2);
        });

        it("calls setParameterValue each time with parameter.id and parsed paramater as arguments ", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledWith("id1", "2021");
          expect(setParameterValue).toHaveBeenCalledWith("id2", "CA");
        });
      });
    });

    describe("for public questions", () => {
      describe("when parameters length is 0", () => {
        const props = {
          parameters: [],
          query: {
            createdAt: "2021",
          },
          setParameterValue,
        };

        it("calls setParameterValue with empty object as argument", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledTimes(1);
          expect(setParameterValue).toHaveBeenCalledWith({});
        });
      });

      describe("when query has no key that matches a parameter slug", () => {
        const props = {
          parameters: [
            {
              id: "id",
              slug: "slugNotKeyInQuery",
            },
          ],
          query: {
            createdAt: "2021",
          },
          setParameterValue,
        };

        it("calls setParameterValue with empty object as argument", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledWith({});
        });
      });

      describe("when parameters length is 1", () => {
        const props = {
          parameters: [
            {
              id: "id",
              slug: "createdAt",
            },
          ],
          query: {
            createdAt: "2021",
          },
          setParameterValue,
        };

        it("calls setParameterValue once", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledTimes(1);
        });

        it("calls setParameterValue with an object of key parameter.id and value of a parsed query param ", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledWith({ id: "2021" });
        });
      });

      describe("when parameters length is 2", () => {
        const props = {
          parameters: [
            {
              id: "id1",
              slug: "createdAt",
            },
            {
              id: "id2",
              slug: "state",
            },
          ],

          query: {
            createdAt: "2021",
            state: "CA",
          },
          setParameterValue,
        };

        it("calls setParameterValue once", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledTimes(1);
        });

        it("calls setParameterValue with one object as argument, keys of parameter id and parsed param values", () => {
          syncQueryParamsWithURL(props);
          expect(setParameterValue).toHaveBeenCalledWith({
            id1: "2021",
            id2: "CA",
          });
        });
      });
    });
  });

  describe("getValueFromFields", () => {
    it("should parse numbers", () => {
      expect(getValueFromFields("1.23", [ORDERS.TOTAL])).toBe(1.23);
    });

    it("should parse booleans", () => {
      // the sample dataset doesn't have any boolean columns, so we fake one
      const field = { isBoolean: () => true, isNumeric: () => false };
      expect(getValueFromFields("true", [field])).toBe(true);
    });

    it("should parse multiple values", () => {
      const result = getValueFromFields(["123", "321"], [ORDERS.PRODUCT_ID]);
      expect(result).toEqual([123, 321]);
    });

    it("should not parse if some connected fields are strings", () => {
      const result = getValueFromFields("123", [PRODUCTS.ID, PRODUCTS.TITLE]);
      expect(result).toBe("123");
    });

    it("should not parse if there are no fields", () => {
      const result = getValueFromFields("123", []);
      expect(result).toBe("123");
    });

    it("should not parse date/numeric fields", () => {
      const dateField = new Field({
        ...ORDERS.QUANTITY, // some numeric field
        // this test doesn't make as much sense now that coercions set effective_types
        effective_type: "type/DateTime", // make it a date
        coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      });
      const result = getValueFromFields("past30days", [dateField]);
      expect(result).toBe("past30days");
    });
  });
});
