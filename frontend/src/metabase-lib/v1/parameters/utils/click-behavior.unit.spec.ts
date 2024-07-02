import { createMockMetadata } from "__support__/metadata";
import * as dateFormatUtils from "metabase/lib/formatting/date";
import { checkNotNull } from "metabase/lib/types";
import Question from "metabase-lib/v1/Question";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldId, TemplateTagType } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockField,
  createMockNativeDatasetQuery,
  createMockParameter,
} from "metabase-types/api/mocks";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createProductsIdField,
  createProductsEanField,
  createProductsTitleField,
  createProductsCategoryField,
  createProductsVendorField,
  createProductsPriceField,
  createProductsRatingField,
  createProductsCreatedAtField,
  createSampleDatabase,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

import {
  getDataFromClicked,
  formatSourceForTarget,
  getTargetsForDashboard,
  getTargetsForQuestion,
} from "./click-behavior";

const FLOAT_CATEGORY_FIELD = createMockField({
  id: 100,
  table_id: PRODUCTS_ID,
  base_type: "type/Float",
  effective_type: "type/Float",
  semantic_type: "type/Category",
  name: "FLOAT_CATEGORY",
  display_name: "Float Category",
});

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable(),
        createProductsTable({
          fields: [
            createProductsIdField(),
            createProductsEanField(),
            createProductsTitleField(),
            createProductsCategoryField(),
            createProductsVendorField(),
            createProductsPriceField(),
            createProductsRatingField(),
            createProductsCreatedAtField(),
            FLOAT_CATEGORY_FIELD,
          ],
        }),
        createPeopleTable(),
      ],
    }),
  ],
});

const productId = checkNotNull(metadata.field(PRODUCTS.ID));
const productTitle = checkNotNull(metadata.field(PRODUCTS.TITLE));
const productFloatCategory = checkNotNull(
  metadata.field(FLOAT_CATEGORY_FIELD.id),
);
const productCreatedAt = checkNotNull(metadata.field(PRODUCTS.CREATED_AT));

const emptyData = {
  column: {},
  parameter: {},
  parameterBySlug: {},
  parameterByName: {},
  userAttribute: {},
};

describe("metabase/lib/click-behavior", () => {
  describe("getDataFromClicked", () => {
    it("should pull out column values from data", () => {
      const column = createMockColumn({ name: "price" });
      expect(
        getDataFromClicked({
          data: [{ col: column, value: 12.34 }],
        }).column,
      ).toEqual({
        [column.name]: {
          value: 12.34,
          column,
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
            dashboard: createMockDashboard({ parameters: [param] }),
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
      const [{ id, name, target }] = getTargetsForDashboard(
        createMockDashboard({ parameters: [parameter] }),
        createMockDashboardCard({ dashboard_id: 111 }),
      );
      expect(id).toEqual("foo123");
      expect(name).toEqual("My Param");
      expect(target).toEqual({ type: "parameter" as const, id: "foo123" });
    });

    it("should produce a template tag target", () => {
      const [{ id, name, target }] = getTargetsForQuestion(
        new Question(
          createMockCard({
            dataset_query: createMockNativeDatasetQuery({
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
            }),
          }),
          metadata,
        ),
      );
      expect(id).toEqual("foo123");
      expect(name).toEqual("My Variable");
      expect(target).toEqual({ type: "variable", id: "my_variable" });
    });

    it("should produce a template tag dimension target", () => {
      const [{ id, name, target }] = getTargetsForQuestion(
        new Question(
          createMockCard({
            dataset_query: createMockNativeDatasetQuery({
              native: {
                query: "{{my_field_filter}}",
                "template-tags": {
                  my_field_filter: {
                    default: null,
                    dimension: ["field", PRODUCTS.CATEGORY, null],
                    "display-name": "My Field Filter",
                    id: "foo123",
                    name: "my_field_filter",
                    type: "dimension",
                    "widget-type": "category",
                  },
                },
              },
            }),
          }),
          metadata,
        ),
      );
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
        ].map(base_type => createMockColumn({ base_type })),
        parameter: [
          "id",
          "category",
          "location/state",
          "date/single",
          "date/range",
          "date/relative",
          "date/all-options",
          "date/month-year",
        ].map(type => createMockParameter({ type })),
        userAttribute: ["attr"],
      };

      for (const [targetParameterType, expectedSources] of [
        [
          "id",
          {
            column: [createMockColumn({ base_type: "type/Integer" })],
            parameter: [createMockParameter({ type: "id" })],
            userAttribute: ["attr"],
          },
        ],
        [
          "category",
          {
            column: [
              createMockColumn({ base_type: "type/Integer" }),
              createMockColumn({ base_type: "type/Text" }),
            ],
            parameter: [createMockParameter({ type: "category" })],
            userAttribute: ["attr"],
          },
        ],
        [
          "location/state",
          {
            column: [createMockColumn({ base_type: "type/Text" })],
            parameter: [createMockParameter({ type: "location/state" })],
            userAttribute: ["attr"],
          },
        ],
        [
          "date/relative",
          {
            column: [],
            parameter: [createMockParameter({ type: "date/relative" })],
            userAttribute: [],
          },
        ],
        [
          "date/range",
          {
            column: [],
            parameter: [createMockParameter({ type: "date/range" })],
            userAttribute: [],
          },
        ],
        [
          "date/single",
          {
            column: [
              createMockColumn({ base_type: "type/Time" }),
              createMockColumn({ base_type: "type/Date" }),
              createMockColumn({ base_type: "type/DateTime" }),
            ],
            parameter: [createMockParameter({ type: "date/single" })],
            userAttribute: [],
          },
        ],
      ] as [string, Record<string, unknown>][]) {
        it(`should filter sources for a ${targetParameterType} parameter target`, () => {
          const question = new Question(createMockCard(), metadata);
          const parameter = createMockParameter({
            id: "foo123",
            name: "My Param",
            slug: "my_param",
            type: targetParameterType,
          });
          const [{ sourceFilters }] = getTargetsForDashboard(
            createMockDashboard({ parameters: [parameter] }),
            createMockDashboardCard({ dashboard_id: 111 }),
          );

          const filteredSources = {
            column: sources.column.filter(column =>
              sourceFilters.column(column, question),
            ),
            parameter: sources.parameter.filter(sourceFilters.parameter),
            userAttribute: sources.userAttribute.filter(
              sourceFilters.userAttribute,
            ),
          };

          expect(filteredSources).toEqual(expectedSources);
        });
      }

      for (const [targetVariableType, expectedSources] of [
        [
          "text",
          {
            column: [createMockColumn({ base_type: "type/Text" })],
            parameter: [
              createMockParameter({ type: "id" }),
              createMockParameter({ type: "category" }),
              createMockParameter({ type: "location/state" }),
            ],
            userAttribute: ["attr"],
          },
        ],
        [
          "number",
          {
            column: [
              createMockColumn({ base_type: "type/Integer" }),
              createMockColumn({ base_type: "type/Float" }),
            ],
            parameter: [
              createMockParameter({ type: "id" }),
              createMockParameter({ type: "category" }),
              createMockParameter({ type: "location/state" }),
            ],
            userAttribute: [],
          },
        ],
        [
          "date",
          {
            column: [
              createMockColumn({ base_type: "type/Time" }),
              createMockColumn({ base_type: "type/Date" }),
              createMockColumn({ base_type: "type/DateTime" }),
            ],
            parameter: [createMockParameter({ type: "date/single" })],
            userAttribute: [],
          },
        ],
      ] as [TemplateTagType, Record<string, unknown>][]) {
        it(`should filter sources for a ${targetVariableType} variable target`, () => {
          const question = new Question(
            createMockCard({
              dataset_query: createMockNativeDatasetQuery({
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
              }),
            }),
            metadata,
          );
          const [{ sourceFilters }] = getTargetsForQuestion(question);

          const filteredSources = {
            column: sources.column.filter(column =>
              sourceFilters.column(column, question),
            ),
            parameter: sources.parameter.filter(sourceFilters.parameter),
            userAttribute: sources.userAttribute.filter(
              sourceFilters.userAttribute,
            ),
          };

          expect(filteredSources).toEqual(expectedSources);
        });
      }

      for (const [field, expectedSources] of [
        [
          productTitle,
          {
            column: [createMockColumn({ base_type: "type/Text" })],
            parameter: [createMockParameter({ type: "category" })],
            userAttribute: ["attr"],
          },
        ],
        [
          productFloatCategory,
          {
            column: [
              createMockColumn({ base_type: "type/Integer" }),
              createMockColumn({ base_type: "type/Float" }),
            ],
            parameter: [createMockParameter({ type: "category" })],
            userAttribute: [],
          },
        ],
        [
          productId,
          {
            column: [
              createMockColumn({ base_type: "type/Integer" }),
              createMockColumn({ base_type: "type/Float" }),
            ],
            parameter: [createMockParameter({ type: "id" })],
            userAttribute: [],
          },
        ],
        [
          productCreatedAt,
          {
            column: [
              createMockColumn({ base_type: "type/Time" }),
              createMockColumn({ base_type: "type/Date" }),
              createMockColumn({ base_type: "type/DateTime" }),
            ],
            parameter: [
              createMockParameter({ type: "date/single" }),
              createMockParameter({ type: "date/range" }),
              createMockParameter({ type: "date/relative" }),
              createMockParameter({ type: "date/all-options" }),
              createMockParameter({ type: "date/month-year" }),
            ],
            userAttribute: [],
          },
        ],
      ] as [Field, Record<string, unknown>][]) {
        it(`should filter sources for a ${field.base_type} dimension target`, () => {
          const question = new Question(
            createMockCard({
              dataset_query: createMockNativeDatasetQuery({
                native: {
                  query: "{{my_field_filter}}",
                  "template-tags": {
                    my_field_filter: {
                      default: null,
                      dimension: ["field", field.id as FieldId, null],
                      "display-name": "My Field Filter",
                      id: "foo123",
                      name: "my_field_filter",
                      type: "dimension",
                      "widget-type": "category",
                    },
                  },
                },
              }),
            }),
            metadata,
          );

          const [{ sourceFilters }] = getTargetsForQuestion(question);

          const filteredSources = {
            column: sources.column.filter(column =>
              sourceFilters.column(column, question),
            ),
            parameter: sources.parameter.filter(sourceFilters.parameter),
            userAttribute: sources.userAttribute.filter(
              sourceFilters.userAttribute,
            ),
          };

          expect(filteredSources).toEqual(expectedSources);
        });
      }
    });
  });

  describe("formatSourceForTarget", () => {
    it("should not change text parameters", () => {
      const source = {
        type: "column" as const,
        id: "SOME_STRING",
        name: "string",
      };
      const target = { type: "parameter" as const, id: "param123" };
      const data = {
        ...emptyData,
        column: {
          some_string: {
            value: "foo",
            column: createMockColumn({ base_type: "type/Text" }),
          },
        },
      };
      const extraData = {
        // the UI wouldn't actually let you configure a text column -> date param link
        dashboard: createMockDashboard({
          parameters: [
            createMockParameter({ id: "param123", type: "date/single" }),
          ],
        }),
      };
      const clickBehavior = { type: "crossfilter" as const };
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

      const source = { type: "column" as const, id: "SOME_DATE", name: "date" };
      const target = { type: "parameter" as const, id: "param123" };
      const data = {
        ...emptyData,
        column: {
          some_date: {
            value: "2020-01-01T00:00:00+05:00",
            column: createMockColumn({
              base_type: "type/DateTime",
              unit: "year",
            }),
          },
        },
      };
      const extraData = {
        dashboard: createMockDashboard({
          parameters: [
            createMockParameter({ id: "param123", type: "date/all-options" }),
          ],
        }),
      };
      const clickBehavior = { type: "crossfilter" as const };
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
      const source = { type: "column" as const, id: "SOME_DATE", name: "date" };
      const target = { type: "parameter" as const, id: "param123" };
      const data = {
        ...emptyData,
        column: {
          some_date: {
            value: "2020-01-01T00:00:00+05:00",
            column: createMockColumn({ base_type: "type/DateTime" }),
          },
        },
      };
      const extraData = {
        dashboard: createMockDashboard({
          parameters: [
            createMockParameter({ id: "param123", type: "date/month-year" }),
          ],
        }),
      };
      const clickBehavior = { type: "crossfilter" as const };
      const value = formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      });
      expect(value).toEqual("2020-01");
    });

    it("should format datetimes for variables", () => {
      const source = { type: "column" as const, id: "SOME_DATE", name: "date" };
      const target = { type: "variable" as const, id: "my_variable" };
      const data = {
        ...emptyData,
        column: {
          some_date: {
            value: "2020-01-01T00:00:00+05:00",
            column: createMockColumn({ base_type: "type/DateTime" }),
          },
        },
      };
      const extraData = {};
      const clickBehavior = {
        type: "link" as const,
        linkType: "question" as const,
        targetId: 123,
      };
      const value = formatSourceForTarget(source, target, {
        data,
        extraData,
        clickBehavior,
      });
      expect(value).toEqual("2020-01-01");
    });
  });
});
