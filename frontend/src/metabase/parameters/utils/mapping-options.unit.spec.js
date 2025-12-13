import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  SAMPLE_METADATA,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockDashboardCard,
  createMockNativeDatasetQuery,
  createMockParameter,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  SAMPLE_DB_ID,
  createAdHocCard,
  createAdHocNativeCard,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getMappingOptionByTarget,
  getParameterMappingOptions,
} from "./mapping-options";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);

function structured(query) {
  return createAdHocCard({
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query,
    },
  });
}

function native(native) {
  return createAdHocNativeCard({
    dataset_query: {
      type: "native",
      database: SAMPLE_DB_ID,
      native,
    },
  });
}

describe("parameters/utils/mapping-options", () => {
  describe("getParameterMappingOptions", () => {
    describe("structured model", () => {
      let dataset;
      let virtualCardTable;

      beforeEach(() => {
        const question = ordersTable.question();
        dataset = question.setCard({
          ...question.card(),
          id: 123,
          type: "model",
        });

        // create a virtual table for the card
        // that contains fields with custom, model-specific metadata
        virtualCardTable = ordersTable.clone();
        virtualCardTable.id = `card__123`;
        virtualCardTable.fields = [
          metadata.field(ORDERS.CREATED_AT).clone({
            table_id: `card__123`,
            uniqueId: `card__123:${ORDERS.CREATED_AT}`,
            display_name: "~*~Created At~*~",
          }),
        ];

        // add instances to the `metadata` instance
        metadata.questions[dataset.id()] = dataset;
        metadata.tables[virtualCardTable.id] = virtualCardTable;
        virtualCardTable.fields.forEach((f) => {
          metadata.fields[f.uniqueId] = f;
        });
      });

      it("should return fields from the model question's virtual card table, as though it is already nested", () => {
        const options = getParameterMappingOptions(
          new Question(dataset.card(), metadata),
          { type: "date/single" },
          dataset.card(),
        );

        expect(options).toEqual([
          {
            icon: "calendar",
            isForeign: false,
            name: "~*~Created At~*~",
            sectionName: "Orders",
            target: [
              "dimension",
              ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
              { "stage-number": 0 },
            ],
          },
        ]);
      });
    });

    describe("native model", () => {
      it("should not return mapping options for native models", () => {
        const card = createMockCard({
          type: "model",
          dataset_query: createMockNativeDatasetQuery({
            native: {
              query: "SELECT * FROM ORDERS",
            },
          }),
        });
        const table = createOrdersTable();
        const metadata = createMockMetadata({
          databases: [createSampleDatabase()],
          tables: [
            createMockTable({
              id: `card__${card.id}`,
              fields: (table.fields ?? []).map((field) => ({
                ...field,
                table_id: `card__${card.id}`,
              })),
            }),
          ],
          questions: [card],
        });
        const question = new Question(card, metadata);
        const parameter = createMockParameter({ type: "number/=" });

        const options = getParameterMappingOptions(question, parameter, card);
        expect(options).toHaveLength(0);
      });
    });

    describe("structured query", () => {
      it("should return field-id and fk-> dimensions", () => {
        const card = structured({
          "source-table": REVIEWS_ID,
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
        );
        expect(options).toEqual([
          {
            sectionName: "Reviews",
            icon: "calendar",
            name: "Created At",
            target: [
              "dimension",
              ["field", REVIEWS.CREATED_AT, { "base-type": "type/DateTime" }],
              { "stage-number": 0 },
            ],
            isForeign: false,
          },
          {
            sectionName: "Product",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "source-field": REVIEWS.PRODUCT_ID,
                },
              ],
              { "stage-number": 0 },
            ],
            isForeign: true,
          },
        ]);
      });

      it("should also return fields from explicitly joined tables", () => {
        const card = structured({
          "source-table": ORDERS_ID,
          joins: [
            {
              alias: "Product",
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  { "base-type": "type/BigInteger" },
                ],
                ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
              ],
            },
          ],
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
        );
        expect(options).toEqual([
          {
            sectionName: "Orders",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
              { "stage-number": 0 },
            ],
            isForeign: false,
          },
          {
            sectionName: "Products",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CREATED_AT,
                { "base-type": "type/DateTime", "join-alias": "Product" },
              ],
              { "stage-number": 0 },
            ],
            isForeign: true,
          },
          {
            sectionName: "User",
            name: "Birth Date",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PEOPLE.BIRTH_DATE,
                {
                  "base-type": "type/Date",
                  "source-field": ORDERS.USER_ID,
                },
              ],
              { "stage-number": 0 },
            ],
            isForeign: true,
          },
          {
            sectionName: "User",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              [
                "field",
                PEOPLE.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "source-field": ORDERS.USER_ID,
                },
              ],
              { "stage-number": 0 },
            ],
            isForeign: true,
          },
        ]);
      });

      it("should return fields in nested query", () => {
        const card = structured({
          "source-query": {
            "source-table": PRODUCTS_ID,
          },
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
        );
        expect(options).toEqual([
          {
            sectionName: "Products",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
              { "stage-number": 0 },
            ],
            isForeign: false,
          },
          {
            sectionName: "Summaries",
            name: "Created At",
            icon: "calendar",
            target: [
              "dimension",
              ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
              { "stage-number": 1 },
            ],
            isForeign: false,
          },
        ]);
      });
    });

    describe("native query", () => {
      it("should return variables for non-dimension template-tags", () => {
        const card = native({
          query: "select * from ORDERS where CREATED_AT = {{created}}",
          "template-tags": {
            created: {
              type: "date",
              name: "created",
            },
          },
        });
        const options = getParameterMappingOptions(
          new Question(card, metadata),
          { type: "date/single" },
          card,
        );
        expect(options).toEqual([
          {
            name: "created",
            icon: "calendar",
            target: ["variable", ["template-tag", "created"]],
            isForeign: false,
          },
        ]);
      });
    });

    it("should return dimensions for dimension template-tags", () => {
      const card = native({
        query: "select * from ORDERS where CREATED_AT = {{created}}",
        "template-tags": {
          created: {
            type: "dimension",
            name: "created",
            dimension: ["field", ORDERS.CREATED_AT, null],
          },
        },
      });
      const options = getParameterMappingOptions(
        new Question(card, metadata),
        { type: "date/single" },
        card,
      );
      expect(options).toEqual([
        {
          name: "Created At",
          icon: "calendar",
          target: [
            "dimension",
            ["template-tag", "created"],
            { "stage-number": 0 },
          ],
          isForeign: false,
        },
      ]);
    });
  });

  describe("iframe dashcard", () => {
    const createIframeDashcard = (iframeContent) =>
      createMockDashboardCard({
        visualization_settings: {
          virtual_card: {
            display: "iframe",
          },
          iframe: iframeContent,
        },
      });

    const getIframeOptions = (iframeContent) =>
      getParameterMappingOptions(
        undefined,
        null,
        { display: "iframe" },
        createIframeDashcard(iframeContent),
      );

    const expectedTagOptions = (tags) =>
      tags.map((tag) => ({
        name: tag,
        icon: "string",
        isForeign: false,
        target: ["text-tag", tag],
      }));

    it("should return tag options from iframe src URL", () => {
      const options = getIframeOptions(
        "https://example.com/embed/{{foo}}/{{bar}}",
      );
      expect(options).toEqual(expectedTagOptions(["foo", "bar"]));
    });

    it("should return tag options from iframe HTML", () => {
      const options = getIframeOptions(
        '<iframe src="https://example.com/embed/{{foo}}/{{bar}}"></iframe>',
      );
      expect(options).toEqual(expectedTagOptions(["foo", "bar"]));
    });

    it("should return empty array for iframe without template tags", () => {
      const options = getIframeOptions("https://example.com/embed");
      expect(options).toEqual([]);
    });

    it("should return empty array if iframe src is invalid", () => {
      const options = getIframeOptions("not-a-valid-url");
      expect(options).toEqual([]);
    });

    it("should ignore template tags in non-src attributes", () => {
      const options = getIframeOptions(
        '<iframe src="https://example.com/embed/{{foo}}" allow="{{bar}}" allowfullscreen="{{baz}}"></iframe>',
      );
      expect(options).toEqual(expectedTagOptions(["foo"]));
    });
  });

  describe("link dashcard", () => {
    const createLinkDashcard = (linkUrl) =>
      createMockDashboardCard({
        visualization_settings: {
          virtual_card: {
            display: "link",
          },
          link: {
            url: linkUrl,
          },
        },
      });

    const getLinkOptions = (linkUrl) =>
      getParameterMappingOptions(
        undefined,
        null,
        { display: "link" },
        createLinkDashcard(linkUrl),
      );

    const expectedTagOptions = (tags) =>
      tags.map((tag) => ({
        name: tag,
        icon: "string",
        isForeign: false,
        target: ["text-tag", tag],
      }));

    it("should return tag options from link URL", () => {
      const options = getLinkOptions("https://example.com/{{foo}}/{{bar}}");
      expect(options).toEqual(expectedTagOptions(["foo", "bar"]));
    });

    it("should return empty array for link without template tags", () => {
      const options = getLinkOptions("https://example.com/page");
      expect(options).toEqual([]);
    });

    it("should return empty array if link URL is undefined", () => {
      const options = getLinkOptions(undefined);
      expect(options).toEqual([]);
    });
  });

  describe("parameterDashcard filtering", () => {
    it("should return empty array when parameterDashcard is from a different tab", () => {
      const card = structured({ "source-table": ORDERS_ID });
      const question = new Question(card, metadata);
      const dashcard = createMockDashboardCard({ dashboard_tab_id: 1 });
      const parameterDashcard = createMockDashboardCard({
        dashboard_tab_id: 2,
      });

      const options = getParameterMappingOptions(
        question,
        { type: "date/single" },
        card,
        dashcard,
        parameterDashcard,
      );

      expect(options).toEqual([]);
    });

    it("should return normal options when parameterDashcard is on same tab", () => {
      const card = structured({ "source-table": ORDERS_ID });
      const question = new Question(card, metadata);
      const dashcard = createMockDashboardCard({ dashboard_tab_id: 1 });
      const parameterDashcard = createMockDashboardCard({
        dashboard_tab_id: 1,
      });

      const options = getParameterMappingOptions(
        question,
        { type: "date/single" },
        card,
        dashcard,
        parameterDashcard,
      );

      expect(options.length).toBeGreaterThan(0);
    });

    it("should return empty array when inline parameter on question card tries to map to different card", () => {
      const card = structured({ "source-table": ORDERS_ID });
      const question = new Question(card, metadata);
      const dashcard = createMockDashboardCard({
        id: 1,
        dashboard_tab_id: 1,
        card_id: 123,
      });
      const parameterDashcard = createMockDashboardCard({
        id: 2,
        dashboard_tab_id: 1,
        card_id: 456,
      });

      const options = getParameterMappingOptions(
        question,
        { type: "date/single" },
        card,
        dashcard,
        parameterDashcard,
      );

      expect(options).toEqual([]);
    });

    it("should return normal options when inline parameter on question card maps to its own card", () => {
      const card = structured({ "source-table": ORDERS_ID });
      const question = new Question(card, metadata);
      const dashcard = createMockDashboardCard({
        id: 1,
        dashboard_tab_id: 1,
        card_id: 123,
      });
      const parameterDashcard = createMockDashboardCard({
        id: 1,
        dashboard_tab_id: 1,
        card_id: 123,
      });

      const options = getParameterMappingOptions(
        question,
        { type: "date/single" },
        card,
        dashcard,
        parameterDashcard,
      );

      expect(options.length).toBeGreaterThan(0);
    });

    it("should return options when inline parameter on question card has existing connection to different card", () => {
      const card = { ...structured({ "source-table": ORDERS_ID }), id: 123 };
      const question = new Question(card, metadata);
      const parameterId = "param123";
      const parameter = { id: parameterId, type: "date/single" };
      const dashcard = createMockDashboardCard({
        id: 1,
        dashboard_tab_id: 1,
        card_id: 123,
        parameter_mappings: [
          {
            parameter_id: parameterId,
            card_id: 123,
            target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
          },
        ],
      });
      const parameterDashcard = createMockDashboardCard({
        id: 2,
        dashboard_tab_id: 1,
        card_id: 456,
      });

      const options = getParameterMappingOptions(
        question,
        parameter,
        card,
        dashcard,
        parameterDashcard,
      );

      // Should return options to allow users to see and potentially disconnect existing connections
      expect(options.length).toBeGreaterThan(0);
    });
  });

  describe("includeSensitiveFields option", () => {
    const sensitiveFieldId = 9999;
    const database = createSampleDatabase();
    const ordersTable = createOrdersTable({
      fields: [
        ...createOrdersTable().fields,
        {
          id: sensitiveFieldId,
          table_id: ORDERS_ID,
          name: "SECRET_FIELD",
          display_name: "Secret Field",
          base_type: "type/Text",
          semantic_type: null,
          visibility_type: "sensitive",
        },
      ],
    });
    database.tables = database.tables.map((t) =>
      t.id === ORDERS_ID ? ordersTable : t,
    );

    const metadata = createMockMetadata({ databases: [database] }, undefined, {
      includeSensitiveFields: true,
    });
    const card = structured({ "source-table": ORDERS_ID });
    const question = new Question(card, metadata);

    it("should exclude sensitive fields by default", () => {
      const options = getParameterMappingOptions(
        question,
        { type: "string/=" },
        card,
      );

      const sensitiveOption = options.find(
        (opt) => opt.name === "Secret Field",
      );
      expect(sensitiveOption).toBeUndefined();
    });

    it("should include sensitive fields when includeSensitiveFields is true", () => {
      const options = getParameterMappingOptions(
        question,
        { type: "string/=" },
        card,
        null,
        null,
        { includeSensitiveFields: true },
      );

      const sensitiveOption = options.find(
        (opt) => opt.name === "Secret Field",
      );
      expect(sensitiveOption).toBeDefined();
      expect(sensitiveOption.name).toBe("Secret Field");
    });
  });
});

describe("getMappingOptionByTarget", () => {
  describe("virtual dashcard", () => {
    it("should find mapping option", () => {
      const mappingOption = {
        name: "param",
        icon: "string",
        isForeign: false,
        target: ["text-tag", "param"],
      };
      const target = ["text-tag", "param"];

      expect(getMappingOptionByTarget([mappingOption], target)).toBe(
        mappingOption,
      );
    });

    it("should return undefined if option is not found", () => {
      const mappingOption = {
        name: "param",
        icon: "string",
        isForeign: false,
        target: ["text-tag", "param"],
      };
      const target = ["text-tag", "param2"];

      expect(getMappingOptionByTarget([mappingOption], target)).toBe(undefined);
    });
  });

  describe("native dashcard", () => {
    it("should find mapping option", () => {
      const mappingOption = {
        name: "Source",
        icon: "string",
        isForeign: false,
        target: ["variable", ["template-tag", "source"]],
      };
      const target = ["variable", ["template-tag", "source"]];

      expect(getMappingOptionByTarget([mappingOption], target)).toBe(
        mappingOption,
      );
    });

    it("should return undefined if option is not found", () => {
      const mappingOption = {
        name: "Source",
        icon: "string",
        isForeign: false,
        target: ["variable", ["template-tag", "source"]],
      };
      const target = ["variable", ["template-tag", "source1"]];

      expect(getMappingOptionByTarget([mappingOption], target)).toBe(undefined);
    });
  });

  describe("structured dashcard", () => {
    let question;

    beforeEach(() => {
      const card = createMockCard({
        dataset_query: createMockStructuredDatasetQuery({
          query: {
            "source-table": 2,
          },
        }),
      });
      const database = createSampleDatabase();
      const metadata = createMockMetadata({
        questions: [card],
        databases: [database],
      });

      question = new Question(card, metadata);
    });

    it("should find mapping option", () => {
      const mappingOption = {
        sectionName: "User",
        name: "Name",
        icon: "string",
        target: [
          "dimension",
          [
            "field",
            1,
            {
              "base-type": "type/Text",
            },
          ],
        ],
        isForeign: true,
      };

      const target = [
        "dimension",
        [
          "field",
          1,
          {
            "base-type": "type/Text",
          },
        ],
      ];

      expect(getMappingOptionByTarget([mappingOption], target, question)).toBe(
        mappingOption,
      );
    });

    it("should not confuse columns from different stages", () => {
      const query = Lib.appendStage(
        createQueryWithClauses({
          breakouts: [
            {
              columnName: "CREATED_AT",
              tableName: "ORDERS",
              temporalBucketName: "Month",
            },
          ],
        }),
      );
      const question = Question.create({ metadata: SAMPLE_METADATA }).setQuery(
        query,
      );

      const mappingOptions = [
        {
          sectionName: "Order",
          name: "Created At",
          icon: "calendar",
          target: [
            "dimension",
            ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
            { "stage-number": 0 },
          ],
        },
        {
          sectionName: "Order",
          name: "Created At",
          icon: "calendar",
          target: [
            "dimension",
            ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
            { "stage-number": 1 },
          ],
        },
      ];

      const target = [
        "dimension",
        ["field", "CREATED_AT", { "base-type": "type/Text" }],
        { "stage-number": 1 },
      ];

      expect(getMappingOptionByTarget(mappingOptions, target, question)).toBe(
        mappingOptions[1],
      );
    });

    it("should ignore targets with invalid stage index", () => {
      const mappingOptions = [
        {
          sectionName: "Order",
          name: "Created At",
          icon: "calendar",
          target: [
            "dimension",
            ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
            { "stage-number": 0 },
          ],
        },
      ];

      const target = [
        "dimension",
        ["field", "CREATED_AT", { "base-type": "type/Text" }],
        { "stage-number": 1 },
      ];

      expect(
        getMappingOptionByTarget(mappingOptions, target, question),
      ).toBeUndefined();
    });

    it("should return undefined if option is not found", () => {
      const card = createMockCard({
        dataset_query: createMockStructuredDatasetQuery({
          query: {
            "source-table": 2,
          },
        }),
      });
      const database = createSampleDatabase();
      const metadata = createMockMetadata({
        questions: [card],
        databases: [database],
      });

      const question = new Question(card, metadata);

      const mappingOption = {
        sectionName: "User",
        name: "Name",
        icon: "string",
        target: [
          "dimension",
          [
            "field",
            1,
            {
              "base-type": "type/Text",
            },
          ],
        ],
        isForeign: true,
      };

      const target = [
        "dimension",
        [
          "field",
          2,
          {
            "base-type": "type/Text",
          },
        ],
      ];

      expect(getMappingOptionByTarget([mappingOption], target, question)).toBe(
        undefined,
      );
    });
  });
});
