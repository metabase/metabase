import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  getTemplateTagParameters,
  getTemplateTags,
} from "metabase-lib/v1/parameters/utils/template-tags";
import type {
  Card,
  DatasetQuery,
  TemplateTag,
  TemplateTagType,
} from "metabase-types/api";
import {
  createMockCard,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

const createLegacyCard = (datasetQuery: unknown): Card =>
  // legacy dataset_query shapes that DatasetQuery cannot express
  createMockCard({ dataset_query: datasetQuery as DatasetQuery });

describe("parameters/utils/cards", () => {
  describe("getTemplateTags", () => {
    it("should return an empty array for a non-native query", () => {
      const card = createMockCard({
        dataset_query: Lib.createTestJsQuery(
          SAMPLE_PROVIDER,
          DEFAULT_TEST_QUERY,
        ),
      });
      expect(getTemplateTags(card, metadata)).toEqual([]);
    });

    it("should return an empty array for an internal query", () => {
      const card = createLegacyCard({
        type: "internal",
        fn: "metabase-enterprise.audit-app.pages.queries/bad-table",
        args: [],
      });
      expect(getTemplateTags(card, metadata)).toEqual([]);
    });

    it("should return an empty array for a non-parameterized query", () => {
      const card = createMockCard({
        dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
          query: "select * from PRODUCTS",
        }),
        query_type: "native",
      });
      expect(getTemplateTags(card, metadata)).toEqual([]);
    });

    it("should extract the template tags", () => {
      const card = createMockCard({
        dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
          query:
            "select * from PRODUCTS where RATING > {{stars}} {{snippet: foo}}",
          templateTags: {
            stars: { type: "number", name: "stars", id: "xyz777" },
            "snippet: foo": {
              type: "snippet",
              name: "snippet: foo",
              id: "abc123",
              "snippet-id": 6,
            },
          },
        }),
        query_type: "native",
      });
      expect(
        getTemplateTags(card, metadata).map(({ name, type }) => [name, type]),
      ).toEqual([
        ["stars", "number"],
        ["snippet: foo", "snippet"],
      ]);
    });

    it("should return minimal legacy tags unmodified", () => {
      const starsTag = { type: "number", name: "stars", id: "xyz777" };
      const card = createLegacyCard({
        type: "native",
        native: {
          query: "select * from PRODUCTS where RATING > {{stars}}",
          "template-tags": { stars: starsTag },
        },
      });
      expect(getTemplateTags(card, metadata)).toEqual([starsTag]);
    });
  });

  describe("getTemplateTagParameters", () => {
    let tags: TemplateTag[];

    beforeEach(() => {
      // legacy-shaped tags (numeric ids, retired types) that TemplateTag cannot express
      tags = [
        {
          "widget-type": "foo",
          type: "string",
          id: 1,
          name: "a",
          "display-name": "A",
          default: "abc",
        },
        {
          type: "string",
          id: 2,
          name: "b",
          "display-name": "B",
        },
        {
          type: "number",
          id: 3,
          name: "c",
          "display-name": "C",
        },
        {
          type: "date",
          id: 4,
          name: "d",
          "display-name": "D",
        },
        {
          "widget-type": "foo",
          type: "dimension",
          id: 5,
          name: "e",
          "display-name": "E",
        },
        {
          type: null,
          id: 6,
        },
        {
          type: "dimension",
          id: 7,
          name: "f",
          "display-name": "F",
        },
      ] as unknown as TemplateTag[];
    });

    it("should convert tags into tag parameters with field filter operator types", () => {
      const parametersWithFieldFilterOperatorTypes = [
        {
          default: "abc",
          id: 1,
          name: "A",
          slug: "a",
          target: ["variable", ["template-tag", "a"]],
          type: "foo",
          isMultiSelect: false,
        },
        {
          default: undefined,
          id: 2,
          name: "B",
          slug: "b",
          target: ["variable", ["template-tag", "b"]],
          type: "string/=",
          isMultiSelect: false,
        },
        {
          default: undefined,
          id: 3,
          name: "C",
          slug: "c",
          target: ["variable", ["template-tag", "c"]],
          type: "number/=",
          isMultiSelect: false,
        },
        {
          default: undefined,
          id: 4,
          name: "D",
          slug: "d",
          target: ["variable", ["template-tag", "d"]],
          type: "date/single",
          isMultiSelect: false,
        },
        {
          default: undefined,
          id: 5,
          name: "E",
          slug: "e",
          target: ["dimension", ["template-tag", "e"]],
          type: "foo",
          isMultiSelect: true,
        },
      ];

      expect(getTemplateTagParameters(tags)).toEqual(
        parametersWithFieldFilterOperatorTypes,
      );
    });

    it("should produce string/= for text tags without widget-type (QUE2-326)", () => {
      const tags = [
        createMockTemplateTag({
          type: "text",
          id: "1",
          name: "name",
          "display-name": "Name",
        }),
      ];
      expect(getTemplateTagParameters(tags)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "1",
            name: "Name",
            slug: "name",
            target: ["variable", ["template-tag", "name"]],
            type: "string/=",
          }),
        ]),
      );
    });

    it("should produce boolean/= for boolean tags without widget-type (QUE2-326)", () => {
      const tags = [
        createMockTemplateTag({
          type: "boolean",
          id: "1",
          name: "active",
          "display-name": "Is Active",
        }),
      ];
      expect(getTemplateTagParameters(tags)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "1",
            name: "Is Active",
            slug: "active",
            target: ["variable", ["template-tag", "active"]],
            type: "boolean/=",
          }),
        ]),
      );
    });

    it("should produce string/= for unknown tag types (QUE2-326)", () => {
      const tags = [
        createMockTemplateTag({
          // not a real TemplateTagType: exercises the string/= fallback
          type: "unknown-type" as TemplateTagType,
          id: "1",
          name: "x",
          "display-name": "X",
        }),
      ];
      expect(getTemplateTagParameters(tags)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "1",
            name: "X",
            slug: "x",
            target: ["variable", ["template-tag", "x"]],
            type: "string/=",
          }),
        ]),
      );
    });

    it("should exclude tags that are not parameters", () => {
      const tags = [
        createMockTemplateTag({
          // legacy tag type value that predates the TemplateTagType union
          type: "string" as TemplateTagType,
          id: "1",
          name: "a",
          "display-name": "A",
        }),
        createMockTemplateTag({
          type: "card",
          id: "2",
          "card-id": 123,
        }),
        createMockTemplateTag({
          type: "snippet",
          id: "3",
          "snippet-id": 1,
          "snippet-name": "C",
        }),
      ];
      expect(getTemplateTagParameters(tags)).toEqual([
        {
          default: undefined,
          id: "1",
          name: "A",
          slug: "a",
          target: ["variable", ["template-tag", "a"]],
          type: "string/=",
          isMultiSelect: false,
        },
      ]);
    });
  });
});
