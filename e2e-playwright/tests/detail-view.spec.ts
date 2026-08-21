/**
 * Playwright port of e2e/test/scenarios/detail-view/detail-view.cy.spec.ts
 */
import type { MetabaseApi } from "../support/api";
import { icon } from "../support/dashboard-cards";
import {
  getDetailsRowValue,
  getHeader,
  getRelationships,
  queryBuilderFiltersPanel,
  remapDisplayValueToFK,
  verifyDetails,
  visitModel,
  visitTable,
} from "../support/detail-view";
import { test, expect } from "../support/fixtures";
import { SECOND_COLLECTION_ID } from "../support/question-new";
import {
  FIRST_COLLECTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { isScrollableHorizontally } from "../support/search";
import { appBar, queryBuilderHeader } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

const VERY_LONG_STRING = "VERY_LONG_STRING_".repeat(10);

test.describe("detail view", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("table", () => {
    test("displays object details with breadcrumbs and relationships", async ({
      page,
    }) => {
      await visitTable(page, PRODUCTS_ID, 1);

      await expect(
        page.getByRole("heading", {
          name: "Rustic Paper Wallet",
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "1", level: 2, exact: true }),
      ).toBeVisible();
      // cy.icon matched every .Icon-document; Cypress asserted on all,
      // Playwright needs a single element.
      await expect(icon(page, "document").first()).toBeVisible();

      const bar = appBar(page);
      const databaseLink = bar.getByRole("link", { name: /Sample Database/ });
      await expect(databaseLink).toBeVisible();
      await expect(databaseLink).toHaveAttribute(
        "href",
        `/browse/databases/${SAMPLE_DB_ID}`,
      );
      const tableLink = bar.getByRole("link", {
        name: "Products",
        exact: true,
      });
      await expect(tableLink).toBeVisible();
      await expect(tableLink).toHaveAttribute(
        "href",
        `/table/${PRODUCTS_ID}-products`,
      );
      await expect(
        bar.getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();

      await verifyDetails(page, [
        ["ID", "1"],
        ["Ean", "1018947080336"],
        ["Title", "Rustic Paper Wallet"],
        ["Category", "Gizmo"],
        ["Vendor", "Swaniawski, Casper and Hilll"],
        ["Price", "29.46"],
        ["Rating", "4.6"],
        ["Created At", "July 19, 2026, 7:44 PM"],
      ]);

      const relationships = getRelationships(page);
      await expect(
        relationships.getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();
      await expect(
        relationships.getByRole("link", { name: "93 Orders", exact: true }),
      ).toBeVisible();
      const reviewsLink = relationships.getByRole("link", {
        name: "8 Reviews",
        exact: true,
      });
      await expect(reviewsLink).toBeVisible();
      await reviewsLink.click();

      await expect(
        queryBuilderHeader(page).getByText("Reviews", { exact: true }),
      ).toBeVisible();
      await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(
        1,
      );
      await expect(
        queryBuilderFiltersPanel(page).getByText("Product ID is 1", {
          exact: true,
        }),
      ).toBeVisible();
      const rowCount = page.getByTestId("question-row-count");
      await expect(rowCount).toBeVisible();
      await expect(rowCount).toHaveText("Showing 8 rows");
    });

    test("shows loading state and 404 error state", async ({ page }) => {
      await visitTable(page, PRODUCTS_ID, 9999);

      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Row not found", exact: true }),
      ).toBeVisible();

      const bar = appBar(page);
      await expect(
        bar.getByRole("link", { name: /Sample Database/ }),
      ).toBeVisible();
      await expect(
        bar.getByRole("link", { name: "Products", exact: true }),
      ).toBeVisible();
      await expect(bar.getByText("9999", { exact: true })).toBeVisible();
    });
  });

  test.describe("model", () => {
    test("displays object details with breadcrumbs", async ({ page, mb }) => {
      const card = await createOrdersJoinProductsModel(mb.api);
      await visitModel(page, card.id, 1);

      await expect(
        page.getByRole("heading", {
          name: "Awesome Concrete Shoes",
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "1", level: 2, exact: true }),
      ).toBeVisible();
      // cy.icon matched every .Icon-document; Cypress asserted on all,
      // Playwright needs a single element.
      await expect(icon(page, "document").first()).toBeVisible();

      const bar = appBar(page);
      const firstCollectionLink = bar.getByRole("link", {
        name: /First collection/,
      });
      await expect(firstCollectionLink).toBeVisible();
      await expect(firstCollectionLink).toHaveAttribute(
        "href",
        `/collection/${FIRST_COLLECTION_ID}-first-collection`,
      );
      const secondCollectionLink = bar.getByRole("link", {
        name: /Second collection/,
      });
      await expect(secondCollectionLink).toBeVisible();
      await expect(secondCollectionLink).toHaveAttribute(
        "href",
        `/collection/${SECOND_COLLECTION_ID}-second-collection`,
      );
      const modelLink = bar.getByRole("link", { name: /My model/ });
      await expect(modelLink).toBeVisible();
      await expect(modelLink).toHaveAttribute(
        "href",
        `/model/${card.id}-my-model`,
      );
      await expect(
        bar.getByText("Awesome Concrete Shoes", { exact: true }),
      ).toBeVisible();

      await verifyDetails(page, [
        ["ID", "1"],
        ["User ID", "1"],
        ["Product ID", "14"],
        ["Subtotal", "37.65"],
        ["Tax", "2.07"],
        ["Total", "39.72"],
        ["Discount ($)", "empty"],
        ["Created At", "February 11, 2028, 9:40 PM"],
        ["Quantity", "2"],
        ["Order image", "https://example.com/order/1.jpg"],
        ["Product image", "https://example.com/product/14.jpg"],
        ["Products → Category", "Widget"],
        ["Products → Created At", "December 31, 2026, 2:41 PM"],
        ["Products → Ean", "8833419218504"],
        ["Products → Price", "25.1"],
        ["Products → Rating", "4"],
        ["Products → Title", "Awesome Concrete Shoes"],
        ["Products → Vendor", "McClure-Lockman"],
      ]);

      await expect(getRelationships(page)).toHaveCount(0);
    });

    test("shows 404 error state", async ({ page, mb }) => {
      const card = await createOrdersJoinProductsModel(mb.api);
      await visitModel(page, card.id, 9999);

      await expect(page.getByTestId("loading-indicator")).toBeVisible();
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(
        page.getByRole("heading", { name: "Row not found", exact: true }),
      ).toBeVisible();

      const bar = appBar(page);
      await expect(
        bar.getByRole("link", { name: /First collection/ }),
      ).toBeVisible();
      await expect(
        bar.getByRole("link", { name: /Second collection/ }),
      ).toBeVisible();
      await expect(bar.getByRole("link", { name: /My model/ })).toBeVisible();
      await expect(bar.getByText("9999", { exact: true })).toBeVisible();
    });
  });

  test.describe("value rendering", () => {
    test("respects datamodel remapping and viz settings", async ({
      page,
      mb,
    }) => {
      // user id - fk remapping
      await remapDisplayValueToFK(mb.api, {
        display_value: ORDERS.USER_ID,
        name: "User",
        fk: PEOPLE.NAME,
      });

      // product id - fk remapping + view as link setting
      await remapDisplayValueToFK(mb.api, {
        display_value: ORDERS.PRODUCT_ID,
        name: "Product",
        fk: PRODUCTS.TITLE,
      });
      await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
        settings: {
          view_as: "link",
          link_text: "Product: {{PRODUCT_ID}}",
          link_url: "https://example.com/{{PRODUCT_ID}}",
        },
      });

      // subtotal - currency_in_header: true
      await mb.api.put(`/api/field/${ORDERS.SUBTOTAL}`, {
        semantic_type: "type/Currency",
      });

      // tax - currency_in_header: false
      await mb.api.put(`/api/field/${ORDERS.TAX}`, {
        semantic_type: "type/Currency",
        settings: {
          currency_in_header: false,
        },
      });

      // total - wrapping very long values
      await mb.api.put(`/api/field/${ORDERS.TOTAL}`, {
        settings: {
          prefix: VERY_LONG_STRING,
        },
      });

      // quantity - custom mapping
      await mb.api.put(`/api/field/${ORDERS.QUANTITY}`, {
        settings: {
          has_field_values: "list",
        },
      });
      await mb.api.post(`/api/field/${ORDERS.QUANTITY}/dimension`, {
        name: "Quantity",
        human_readable_field_id: null,
        type: "internal",
      });
      const valuesResponse = await mb.api.get(
        `/api/field/${ORDERS.QUANTITY}/values`,
      );
      const { values } = (await valuesResponse.json()) as {
        values: [number][];
      };
      await mb.api.post(`/api/field/${ORDERS.QUANTITY}/values`, {
        values: values.map(([value]) =>
          value === 2 ? [value, "two"] : [value, String(value)],
        ),
      });

      const card = await createOrdersJoinProductsModel(mb.api);
      await mb.api.put(`/api/card/${card.id}`, {
        result_metadata: card.result_metadata.map((column) => {
          if (
            column.name === "Order image" ||
            column.name === "Product image"
          ) {
            return {
              ...column,
              semantic_type: "type/ImageURL",
              settings: {
                view_as: "image",
              },
            };
          }

          return column;
        }),
      });

      await visitModel(page, card.id, 1);

      const header = getHeader(page);
      const headerImage = header.getByRole("img");
      await expect(headerImage).toBeVisible();
      await expect(headerImage).toHaveAttribute(
        "src",
        "https://example.com/order/1.jpg",
      );
      await expect(
        header.getByRole("heading", {
          name: "Awesome Concrete Shoes",
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        header.getByRole("heading", { name: "1", level: 2, exact: true }),
      ).toBeVisible();

      await verifyDetails(page, [
        ["ID", "1"],
        ["User", "Hudson Borer"],
        ["Product", "Product: Awesome Concrete Shoes"],
        ["Subtotal ($)", "37.65"],
        ["Tax", "$2.07"],
        ["Total", `${VERY_LONG_STRING}39.72`],
        ["Discount ($)", "empty"],
        ["Created At", "February 11, 2028, 9:40 PM"],
        ["Quantity", "two"],
        ["Order image", "https://example.com/order/1.jpg"],
        ["Product image", "https://example.com/product/14.jpg"],
        ["Products → Category", "Widget"],
        ["Products → Created At", "December 31, 2026, 2:41 PM"],
        ["Products → Ean", "8833419218504"],
        ["Products → Price", "25.1"],
        ["Products → Rating", "4"],
        ["Products → Title", "Awesome Concrete Shoes"],
        ["Products → Vendor", "McClure-Lockman"],
      ]);

      // user id remapped to user name
      const userValue = await getDetailsRowValue(page, {
        index: 1,
        rowsCount: 18,
      });
      const userLink = userValue.getByRole("link", {
        name: "Hudson Borer",
        exact: true,
      });
      await expect(userLink).toBeVisible();
      await expect(userLink).toHaveAttribute(
        "href",
        `/table/${PEOPLE_ID}/detail/1`,
      );

      // product id remapped to product title, and custom view_as setting
      const productValue = await getDetailsRowValue(page, {
        index: 2,
        rowsCount: 18,
      });
      const productLink = productValue.getByRole("link", {
        name: "Product: Awesome Concrete Shoes",
        exact: true,
      });
      await expect(productLink).toBeVisible();
      await expect(productLink).toHaveAttribute(
        "href",
        "https://example.com/14",
      );
      await expect(productLink).toHaveAttribute("target", "_blank");
      await expect(productLink).toHaveAttribute("rel", "noopener noreferrer");

      // very long value without whitespace wraps
      // (cy.get("main") ran the assertion on the first matched element)
      expect(await isScrollableHorizontally(page.locator("main").first())).toBe(
        false,
      );

      // image should be rendered in a frame with a link
      const imageValue = await getDetailsRowValue(page, {
        index: 10,
        rowsCount: 18,
      });
      // do not wait for image to load: assert on the attribute, not visibility
      await expect(imageValue.getByRole("img")).toHaveAttribute(
        "src",
        "https://example.com/product/14.jpg",
      );

      const imageLink = imageValue.getByRole("link");
      await expect(imageLink).toHaveText("https://example.com/product/14.jpg");
      await expect(imageLink).toHaveAttribute(
        "href",
        "https://example.com/product/14.jpg",
      );
      await expect(imageLink).toHaveAttribute("target", "_blank");
      await expect(imageLink).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  test("displays emails as links", async ({ page }) => {
    await visitTable(page, PEOPLE_ID, 1);

    const emailValue = await getDetailsRowValue(page, {
      index: 2,
      rowsCount: 13,
    });
    await expect(
      emailValue.getByRole("link", {
        name: "borer-hudson@yahoo.com",
        exact: true,
      }),
    ).toHaveAttribute("href", "mailto:borer-hudson@yahoo.com");
  });
});

interface CardResponse {
  id: number;
  result_metadata: Array<Record<string, unknown> & { name: string }>;
}

/**
 * Local port of createOrdersJoinProductsModel. Uses a raw POST /api/card
 * (rather than api.createQuestion) because the value-rendering test needs
 * the full response body, including result_metadata.
 */
async function createOrdersJoinProductsModel(
  api: MetabaseApi,
): Promise<CardResponse> {
  const response = await api.post("/api/card", {
    name: "My model",
    type: "model",
    display: "table",
    visualization_settings: {},
    collection_id: SECOND_COLLECTION_ID,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
              ["field", PRODUCTS.CREATED_AT, { "join-alias": "Products" }],
              ["field", PRODUCTS.EAN, { "join-alias": "Products" }],
              ["field", PRODUCTS.PRICE, { "join-alias": "Products" }],
              ["field", PRODUCTS.RATING, { "join-alias": "Products" }],
              ["field", PRODUCTS.TITLE, { "join-alias": "Products" }],
              ["field", PRODUCTS.VENDOR, { "join-alias": "Products" }],
            ],
            strategy: "left-join",
            alias: "Products",
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, {}],
              ["field", PRODUCTS.ID, {}],
            ],
            "source-table": PRODUCTS_ID,
          },
        ],
        expressions: {
          "Order image": [
            "concat",
            "https://example.com/order/",
            ["field", ORDERS.ID],
            ".jpg",
          ],
          "Product image": [
            "concat",
            "https://example.com/product/",
            ["field", ORDERS.PRODUCT_ID],
            ".jpg",
          ],
        },
        limit: 5,
      },
    },
  });
  return (await response.json()) as CardResponse;
}
