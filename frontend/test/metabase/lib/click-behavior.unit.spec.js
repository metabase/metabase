import _ from "underscore";
import {
  getDataFromClicked,
  getTargetsWithSourceFilters,
  formatSourceForTarget,
} from "metabase/lib/click-behavior";
import { metadata, PRODUCTS } from "__support__/sample_dataset_fixture";
import * as dateFormatUtils from "metabase/lib/formatting/date";

describe("metabase/lib/click-behavior", () => {
  describe("getDataFromClicked", () => {
    it("should pull out column values from data", () => {
      expect(
        getDataFromClicked({
          data: [
            { col: { name: "price", otherProperties: "foo" }, value: 12.34 },
          ],
        }).column,
      ).toEqual({
        price: {
          value: 12.34,
          column: { name: "price", otherProperties: "foo" },
        },
      });
    });

    it("should include user attribute values from extraData", () => {
      expect(
        getDataFromClicked({ extraData: { userAttributes: { foo: "bar" } } })
          .userAttribute,
      ).toEqual({ foo: { value: "bar" } });
    });

    it("should pull out parameter values from extraData", () => {
      const param = {
        slug: "my_param",
        name: "My Param",
        type: "id",
        id: "foo123",
      };
      expect(
        getDataFromClicked({
          extraData: {
            dashboard: { parameters: [param] },
            parameterValuesBySlug: { my_param: "VAL" },
          },
        }),
      ).toEqual({
        parameter: { foo123: { value: "VAL" } },
        parameterByName: { "my param": { value: "VAL" } },
        parameterBySlug: { my_param: { value: "VAL" } },
        column: {},
        userAttribute: {},
      });
    });
  });

  describe("getTargetsWithSourceFilters", () => {
    it("should produce a parameter target", () => {
      const parameter = {
        id: "foo123",
        name: "My Param",
        slug: "my_param",
        type: "id",
      };
      const [{ id, name, target }] = getTargetsWithSourceFilters({
        isDash: true,
        object: { parameters: [parameter] },
      });
      expect(id).toEqual("foo123");
      expect(name).toEqual("My Param");
      expect(target).toEqual({ type: "parameter", id: "foo123" });
    });

    it("should produce a template tag target", () => {
      const [{ id, name, target }] = getTargetsWithSourceFilters({
        isDash: false,
        object: {
          dataset_query: {
            type: "native",
            native: {
              query: "{{foo}}",
              "template-tags": {
                my_variable: {
                  "display-name": "My Variable",
                  id: "foo123",
                  name: "my_variable",
                  type: "text",
                },
              },
            },
          },
        },
        metadata: {},
      });
      expect(id).toEqual("foo123");
      expect(name).toEqual("My Variable");
      expect(target).toEqual({ type: "variable", id: "my_variable" });
    });

    it("should produce a template tag dimension target", () => {
      const [{ id, name, target }] = getTargetsWithSourceFilters({
        isDash: false,
        object: {
          dataset_query: {
            type: "native",
            native: {
              query: "{{my_field_filter}}",
              "template-tags": {
                my_field_filter: {
                  default: null,
                  dimension: ["field", PRODUCTS.CATEGORY.id, null],
                  "display-name": "My Field Filter",
                  id: "foo123",
                  name: "my_field_filter",
                  type: "dimension",
                  "widget-type": "category",
                },
              },
            },
          },
        },
        metadata,
      });
      expect(id).toEqual("foo123");
      expect(name).toEqual("My Field Filter");
      expect(target).toEqual({
        type: "variable",
        id: "my_field_filter",
      });
    });

    describe("filtering sources", () => {
      const sources = {
        column: [
          "type/Integer",
          "type/Float",
          "type/Time",
          "type/Date",
          "type/DateTime",
          "type/Boolean",
          "type/Enum",
          "type/Text",
        ].map(base_type => ({ base_type })),
        parameter: [
          "id",
          "category",
          "location/state",
          "date/single",
          "date/range",
          "date/relative",
          "date/all-options",
          "date/month-year",
        ].map(type => ({ type })),
        userAttribute: [{ name: "attr" }],
      };

      for (const [targetParameterType, expectedSources] of [
        [
          "id",
          {
            column: [{ base_type: "type/Integer" }],
            parameter: [{ type: "id" }],
            userAttribute: [{ name: "attr" }],
          },
        ],
        [
          "category",
          {
            column: [{ base_type: "type/Integer" }, { base_type: "type/Text" }],
            parameter: [{ type: "category" }],
            userAttribute: [{ name: "attr" }],
          },
        ],
        [
          "location/state",
          {
            column: [{ base_type: "type/Text" }],
            parameter: [{ type: "location/state" }],
            userAttribute: [{ name: "attr" }],
          },
        ],
        [
          "date/relative",
          {
            column: [],
            parameter: [{ type: "date/relative" }],
            userAttribute: [],
          },
        ],
        [
          "date/range",
          {
            column: [],
            parameter: [{ type: "date/range" }],
            userAttribute: [],
          },
        ],
        [
          "date/single",
          {
            column: [
              { base_type: "type/Time" },
              { base_type: "type/Date" },
              { base_type: "type/DateTime" },
            ],
            parameter: [{ type: "date/single" }],
            userAttribute: [],
          },
        ],
      ]) {
        it(`should filter sources for a ${targetParameterType} parameter target`, () => {
          const parameter = {
            id: "foo123",
            name: "My Param",
            slug: "my_param",
            type: targetParameterType,
          };
          const [{ sourceFilters }] = getTargetsWithSourceFilters({
            isDash: true,
            object: { parameters: [parameter] },
          });

          const filteredSources = _.mapObject(sources, (sources, sourceType) =>
            sources.filter(sourceFilters[sourceType]),
          );

          expect(filteredSources).toEqual(expectedSources);
        });
      }

      for (const [targetVariableType, expectedSources] of [
        [
          "text",
          {
            column: [{ base_type: "type/Text" }],
            parameter: [
              { type: "id" },
              { type: "category" },
              { type: "location/state" },
            ],
            userAttribute: [{ name: "attr" }],
          },
        ],
        [
          "number",
          {
            column: [
              { base_type: "type/Integer" },
              { base_type: "type/Float" },
            ],
            parameter: [
              { type: "id" },
              { type: "category" },
              { type: "location/state" },
            ],
            userAttribute: [],
          },
        ],
        [
          "date",
          {
            column: [
              { base_type: "type/Time" },
              { base_type: "type/Date" },
              { base_type: "type/DateTime" },
            ],
            parameter: [{ type: "date/single" }],
            userAttribute: [],
          },
        ],
      ]) {
        it(`should filter sources for a ${targetVariableType} variable target`, () => {
          const [{ sourceFilters }] = getTargetsWithSourceFilters({
            isDash: false,
            object: {
              dataset_query: {
                type: "native",
                native: {
                  query: "{{foo}}",
                  "template-tags": {
                    my_variable: {
                      "display-name": "My Variable",
                      id: "foo123",
                      name: "my_variable",
                      type: targetVariableType,
                    },
                  },
                },
              },
            },
            metadata,
          });

          const filteredSources = _.mapObject(sources, (sources, sourceType) =>
            sources.filter(sourceFilters[sourceType]),
          );

          expect(filteredSources).toEqual(expectedSources);
        });
      }

      for (const [field, expectedSources] of [
        [
          PRODUCTS.TITLE,
          {
            column: [{ base_type: "type/Text" }],
            parameter: [{ type: "category" }],
            userAttribute: [{ name: "attr" }],
          },
        ],
        [
          PRODUCTS.PRICE,
          {
            column: [
              { base_type: "type/Integer" },
              { base_type: "type/Float" },
            ],
            parameter: [{ type: "category" }],
            userAttribute: [],
          },
        ],
        [
          PRODUCTS.ID,
          {
            column: [
              { base_type: "type/Integer" },
              { base_type: "type/Float" },
            ],
            parameter: [{ type: "id" }],
            userAttribute: [],
          },
        ],
        [
          PRODUCTS.CREATED_AT,
          {
            column: [
              { base_type: "type/Time" },
              { base_type: "type/Date" },
              { base_type: "type/DateTime" },
            ],
            parameter: [
              { type: "date/single" },
              { type: "date/range" },
              { type: "date/relative" },
              { type: "date/all-options" },
              { type: "date/month-year" },
            ],
            userAttribute: [],
          },
        ],
      ]) {
        it(`should filter sources for a ${field.base_type} dimension target`, () => {
          const [{ sourceFilters }] = getTargetsWithSourceFilters({
            isDash: false,
            object: {
              dataset_query: {
                type: "native",
                native: {
                  query: "{{my_field_filter}}",
                  "template-tags": {
                    my_field_filter: {
                      default: null,
                      dimension: ["field", field.id, null],
                      "display-name": "My Field Filter",
                      id: "foo123",
                      name: "my_field_filter",
                      type: "dimension",
                      "widget-type": "category",
                    },
                  },
                },
              },
            },
            metadata,
          });
          const filteredSources = _.mapObject(sources, (sources, sourceType) =>
            sources.filter(sourceFilters[sourceType]),
          );

          expect(filteredSources).toEqual(expectedSources);
        });
      }
    });
  });

  describe("formatSourceForTarget", () => {
    it("should not change text parameters", () => {
      const source = { type: "column", id: "SOME_STRING" };
      const target = { type: "parameter", id: "param123" };
      const data = {
        column: {
          some_string: { value: "foo", column: { base_type: "type/Text" } },
        },
      };
      const extraData = {
        // the UI wouldn't actually let you configure a text column -> date param link
        dashboard: { parameters: [{ id: "param123", type: "date/single" }] },
      };
      const clickBehavior = { type: "crossfilter" };
      const value = formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      });
      expect(value).toEqual("foo");
    });

    it("should format date/all-options parameters based on unit", () => {
      const formatDateTimeForParameterSpy = jest.spyOn(
        dateFormatUtils,
        "formatDateTimeForParameter",
      );

      const source = { type: "column", id: "SOME_DATE" };
      const target = { type: "parameter", id: "param123" };
      const data = {
        column: {
          some_date: {
            value: "2020-01-01T00:00:00+05:00",
            column: { base_type: "type/DateTime", unit: "year" },
          },
        },
      };
      const extraData = {
        dashboard: {
          parameters: [{ id: "param123", type: "date/all-options" }],
        },
      };
      const clickBehavior = { type: "crossfilter" };
      const value = formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      });

      expect(formatDateTimeForParameterSpy).toHaveBeenCalledWith(
        "2020-01-01T00:00:00+05:00",
        "year",
      );
      expect(value).toEqual("2020-01-01~2020-12-31");
    });

    it("should format datetimes for date parameters", () => {
      const source = { type: "column", id: "SOME_DATE" };
      const target = { type: "parameter", id: "param123" };
      const data = {
        column: {
          some_date: {
            value: "2020-01-01T00:00:00+05:00",
            column: { base_type: "type/DateTime" },
          },
        },
      };
      const extraData = {
        dashboard: {
          parameters: [{ id: "param123", type: "date/month-year" }],
        },
      };
      const clickBehavior = { type: "crossfilter" };
      const value = formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      });
      expect(value).toEqual("2020-01");
    });

    it("should format datetimes for variables", () => {
      const source = { type: "column", id: "SOME_DATE" };
      const target = { type: "variable", id: "my_variable" };
      const data = {
        column: {
          some_date: {
            value: "2020-01-01T00:00:00+05:00",
            column: { base_type: "type/DateTime" },
          },
        },
      };
      const extraData = {};
      const clickBehavior = { type: "question", targetId: 123 };
      const value = formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      });
      expect(value).toEqual("2020-01-01");
    });
  });
});
