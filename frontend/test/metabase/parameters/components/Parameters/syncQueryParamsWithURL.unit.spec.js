import Field from "metabase-lib/lib/metadata/Field";

import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

import {
  getValueFromFields,
  syncQueryParamsWithURL,
} from "metabase/parameters/components/Parameters/syncQueryParamsWithURL";

const buildProps = props => ({
  setParameterValue: jest.fn(),
  ...props,
});

const buildPropsForInternalQuestion = props =>
  buildProps({
    commitImmediately: true,
    ...props,
  });

const buildPropsForPublicQuestion = props =>
  buildProps({
    setMultipleParameterValues: jest.fn(),
    ...props,
  });

describe("Parameters", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("syncQueryParamsWithURL", () => {
    describe("for internal questions", () => {
      describe("when parameters length is 0", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [],
          query: {
            createdAt: "2021",
          },
        });

        it("does not try to sync parameters", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).not.toHaveBeenCalled();
        });
      });

      describe("when query has no key that matches a parameter slug", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [
            {
              id: "idForslugNotKeyInQuery",
              slug: "slugNotKeyInQuery",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("does not try to sync parameters", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).not.toHaveBeenCalled();
        });
      });

      describe("when parameters length is 1", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("syncs parameter with query params by slugs in one function call", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).toHaveBeenCalledTimes(1);
          expect(props.setParameterValue).toHaveBeenCalledWith(
            "idForCreatedAt",
            "2021",
          );
        });
      });

      describe("when parameters length is 2", () => {
        const props = buildPropsForInternalQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
            {
              id: "idForState",
              slug: "state",
            },
          ],
          query: {
            createdAt: "2021",
            state: "CA",
          },
        });

        it("syncs parameter with query params by slugs in as many function calls as there are matching parameters", () => {
          syncQueryParamsWithURL(props);
          expect(props.setParameterValue).toHaveBeenCalledTimes(2);
          expect(props.setParameterValue).toHaveBeenCalledWith(
            "idForCreatedAt",
            "2021",
          );
          expect(props.setParameterValue).toHaveBeenCalledWith(
            "idForState",
            "CA",
          );
        });
      });
    });

    describe("for public questions", () => {
      describe("when parameters length is 0", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [],
          query: {
            createdAt: "2021",
          },
        });

        it("uses empty object as argument when syncing params", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledTimes(1);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({});
        });
      });

      describe("when query has no key that matches a parameter slug", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [
            {
              id: "idForSlugNotKeyInQuery",
              slug: "slugNotKeyInQuery",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("uses empty object as argument when syncing params", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({});
        });
      });

      describe("when parameters length is 1", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
          ],
          query: {
            createdAt: "2021",
          },
        });

        it("syncs parameter with query params by slugs, by passing one object with as many key/value pairs as there are matching parameters, all in a single function call", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledTimes(1);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({
            idForCreatedAt: "2021",
          });
        });
      });

      describe("when parameters length is 2", () => {
        const props = buildPropsForPublicQuestion({
          parameters: [
            {
              id: "idForCreatedAt",
              slug: "createdAt",
            },
            {
              id: "idForState",
              slug: "state",
            },
          ],
          query: {
            createdAt: "2021",
            state: "CA",
          },
        });

        it("syncs parameter with query params by slugs, by passing one object with as many key/value pairs as there are matching parameters, all in a single function call", () => {
          syncQueryParamsWithURL(props);
          expect(props.setMultipleParameterValues).toHaveBeenCalledTimes(1);
          expect(props.setMultipleParameterValues).toHaveBeenCalledWith({
            idForCreatedAt: "2021",
            idForState: "CA",
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
