import {
  setupAdhocQueryEndpoint,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupFieldEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Nav } from "metabase/detail-view/components";
import { useSelector } from "metabase/redux";
import { Route } from "metabase/router";
import { getDetailViewState } from "metabase/selectors/app";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { DatasetColumn, RowValues } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  createOrdersCreatedAtDatasetColumn,
  createOrdersDiscountDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersSubtotalDatasetColumn,
  createOrdersTaxDatasetColumn,
  createOrdersTotalDatasetColumn,
  createOrdersUserIdDatasetColumn,
  createPeopleIdField,
  createProductsCategoryDatasetColumn,
  createProductsCreatedAtDatasetColumn,
  createProductsEanDatasetColumn,
  createProductsIdField,
  createProductsPriceDatasetColumn,
  createProductsRatingDatasetColumn,
  createProductsTitleDatasetColumn,
  createProductsVendorDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { ModelDetailPage } from "./ModelDetailPage";

registerVisualizations();

const MODEL_ID = 10;
const FIRST_COLLECTION_ID = 1;
const SECOND_COLLECTION_ID = 2;

const SAMPLE_DATABASE = createSampleDatabase();

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
});

const FIRST_COLLECTION = createMockCollection({
  id: FIRST_COLLECTION_ID,
  name: "First collection",
  effective_ancestors: [ROOT_COLLECTION],
});

const SECOND_COLLECTION = createMockCollection({
  id: SECOND_COLLECTION_ID,
  name: "Second collection",
  effective_ancestors: [ROOT_COLLECTION, FIRST_COLLECTION],
});

const ORDER_IMAGE = "https://example.com/order/1.jpg";
const PRODUCT_IMAGE = "https://example.com/product/14.jpg";

const createExpressionColumn = (
  name: string,
  opts?: Partial<DatasetColumn>,
): DatasetColumn =>
  createMockColumn({
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    source: "fields",
    field_ref: ["expression", name],
    ...opts,
  });

const createJoinedColumn = (column: DatasetColumn): DatasetColumn => ({
  ...column,
  name: `Products__${column.name}`,
  display_name: `Products → ${column.display_name}`,
  field_ref: ["field", Number(column.id), { "join-alias": "Products" }],
});

const JOINED_COLUMNS = [
  createProductsCategoryDatasetColumn(),
  createProductsCreatedAtDatasetColumn(),
  createProductsEanDatasetColumn(),
  createProductsPriceDatasetColumn(),
  createProductsRatingDatasetColumn(),
  createProductsTitleDatasetColumn(),
  createProductsVendorDatasetColumn(),
].map(createJoinedColumn);

const JOINED_VALUES: RowValues = [
  "Widget",
  "2026-12-31T14:41:00.000Z",
  "8833419218504",
  25.1,
  4,
  "Awesome Concrete Shoes",
  "McClure-Lockman",
];

const MODEL_COLUMNS: DatasetColumn[] = [
  createOrdersIdDatasetColumn(),
  createOrdersUserIdDatasetColumn(),
  createOrdersProductIdDatasetColumn(),
  createOrdersSubtotalDatasetColumn(),
  createOrdersTaxDatasetColumn(),
  createOrdersTotalDatasetColumn(),
  createOrdersDiscountDatasetColumn(),
  createOrdersCreatedAtDatasetColumn(),
  createOrdersQuantityDatasetColumn(),
  createExpressionColumn("Order image"),
  createExpressionColumn("Product image"),
  ...JOINED_COLUMNS,
];

const MODEL_ROW: RowValues = [
  1,
  1,
  14,
  37.65,
  2.07,
  39.72,
  null,
  "2028-02-11T21:40:00.000Z",
  2,
  ORDER_IMAGE,
  PRODUCT_IMAGE,
  ...JOINED_VALUES,
];

const PREFIX = "VERY_LONG_STRING_";

const VALUE_RENDERING_COLUMNS: DatasetColumn[] = [
  createOrdersIdDatasetColumn(),
  createOrdersUserIdDatasetColumn({
    display_name: "User",
    remapped_to: "NAME",
  }),
  createOrdersProductIdDatasetColumn({
    display_name: "Product",
    remapped_to: "TITLE",
    settings: {
      view_as: "link",
      link_text: "Product: {{PRODUCT_ID}}",
      link_url: "https://example.com/{{PRODUCT_ID}}",
    },
  }),
  createOrdersSubtotalDatasetColumn({ semantic_type: "type/Currency" }),
  createOrdersTaxDatasetColumn({
    semantic_type: "type/Currency",
    settings: { currency_in_header: false },
  }),
  createOrdersTotalDatasetColumn({ settings: { prefix: PREFIX } }),
  createOrdersDiscountDatasetColumn(),
  createOrdersCreatedAtDatasetColumn(),
  createOrdersQuantityDatasetColumn({ remapped_to: "Quantity" }),
  createExpressionColumn("Order image", {
    semantic_type: "type/ImageURL",
    settings: { view_as: "image" },
  }),
  createExpressionColumn("Product image", {
    semantic_type: "type/ImageURL",
    settings: { view_as: "image" },
  }),
  ...JOINED_COLUMNS,
  createMockColumn({
    name: "NAME",
    display_name: "User",
    base_type: "type/Text",
    source: "fields",
    remapped_from: "USER_ID",
    field_ref: ["field", PEOPLE.NAME, { "source-field": PEOPLE.ID }],
  }),
  createMockColumn({
    name: "TITLE",
    display_name: "Product",
    base_type: "type/Text",
    source: "fields",
    remapped_from: "PRODUCT_ID",
    field_ref: ["field", PRODUCTS.TITLE, { "source-field": PRODUCTS.ID }],
  }),
  createMockColumn({
    name: "Quantity",
    display_name: "Quantity",
    base_type: "type/Text",
    source: "fields",
    remapped_from: "QUANTITY",
    field_ref: ["expression", "Quantity"],
  }),
];

const VALUE_RENDERING_ROW: RowValues = [
  ...MODEL_ROW,
  "Hudson Borer",
  "Awesome Concrete Shoes",
  "two",
];

const DetailViewNav = () => {
  const detailView = useSelector(getDetailViewState);
  return detailView ? <Nav detailView={detailView} /> : null;
};

interface SetupOpts {
  rowId: number;
  columns?: DatasetColumn[];
  rows: RowValues[];
}

function setup({ rowId, columns = MODEL_COLUMNS, rows }: SetupOpts) {
  const model = createMockCard({
    id: MODEL_ID,
    name: "My model",
    type: "model",
    collection_id: SECOND_COLLECTION_ID,
    database_id: SAMPLE_DATABASE.id,
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    ),
    result_metadata: MODEL_COLUMNS,
  });

  setupCardEndpoints(model);
  setupCardQueryMetadataEndpoint(
    model,
    createMockCardQueryMetadata({
      databases: [SAMPLE_DATABASE],
      cards: [model],
    }),
  );
  setupCollectionByIdEndpoint({
    collections: [FIRST_COLLECTION, SECOND_COLLECTION],
  });
  setupFieldEndpoints(createPeopleIdField());
  setupFieldEndpoints(createProductsIdField());
  setupAdhocQueryEndpoint(
    createMockDataset({ data: createMockDatasetData({ cols: columns, rows }) }),
  );

  renderWithProviders(
    <Route
      path="/model/:slug/detail/:rowId"
      element={
        <>
          <DetailViewNav />
          <ModelDetailPage />
        </>
      }
    />,
    {
      withRouter: true,
      initialRoute: `/model/${MODEL_ID}-my-model/detail/${rowId}`,
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [SAMPLE_DATABASE] }),
      }),
    },
  );
}

function getDetailRows() {
  return getDetailRowElements().map((row) => [
    within(row).getByTestId("column-name").textContent,
    within(row).getByTestId("value").textContent,
  ]);
}

function getDetailRowElements() {
  return within(screen.getByTestId("object-details")).getAllByTestId(
    "object-details-row",
  );
}

function getDetailRowValue(columnName: string) {
  const row = getDetailRowElements().find(
    (row) => within(row).getByTestId("column-name").textContent === columnName,
  );
  if (row == null) {
    throw new Error(`No details row for column ${columnName}`);
  }
  return within(row).getByTestId("value");
}

describe("ModelDetailPage", () => {
  it("shows a loading indicator and then 'Row not found' for a missing row", async () => {
    setup({ rowId: 9999, rows: [] });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByRole("heading", { name: "Row not found" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /First collection/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Second collection/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My model/ })).toBeInTheDocument();
    expect(screen.getByText("9999")).toBeInTheDocument();
  });

  it("shows the header, breadcrumbs and details of a row", async () => {
    setup({ rowId: 1, rows: [MODEL_ROW] });

    expect(
      await screen.findByRole("heading", {
        name: "Awesome Concrete Shoes",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "1", level: 2 }),
    ).toBeInTheDocument();
    expect(getIcon("document")).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /First collection/ }),
    ).toHaveAttribute(
      "href",
      `/collection/${FIRST_COLLECTION_ID}-first-collection`,
    );
    expect(
      await screen.findByRole("link", { name: /Second collection/ }),
    ).toHaveAttribute(
      "href",
      `/collection/${SECOND_COLLECTION_ID}-second-collection`,
    );
    expect(screen.getByRole("link", { name: /My model/ })).toHaveAttribute(
      "href",
      `/model/${MODEL_ID}-my-model`,
    );

    expect(getDetailRows()).toEqual([
      ["ID", "1"],
      ["User ID", "1"],
      ["Product ID", "14"],
      ["Subtotal", "37.65"],
      ["Tax", "2.07"],
      ["Total", "39.72"],
      ["Discount ($)", "empty"],
      ["Created At", "February 11, 2028, 9:40 PM"],
      ["Quantity", "2"],
      ["Order image", ORDER_IMAGE],
      ["Product image", PRODUCT_IMAGE],
      ["Products → Category", "Widget"],
      ["Products → Created At", "December 31, 2026, 2:41 PM"],
      ["Products → Ean", "8833419218504"],
      ["Products → Price", "25.1"],
      ["Products → Rating", "4"],
      ["Products → Title", "Awesome Concrete Shoes"],
      ["Products → Vendor", "McClure-Lockman"],
    ]);
  });

  describe("value rendering", () => {
    beforeEach(async () => {
      setup({
        rowId: 1,
        columns: VALUE_RENDERING_COLUMNS,
        rows: [VALUE_RENDERING_ROW],
      });
      await screen.findByTestId("object-details");
    });

    it("applies remapping and column settings to the details", () => {
      expect(getDetailRows()).toEqual([
        ["ID", "1"],
        ["User", "Hudson Borer"],
        ["Product", "Product: Awesome Concrete Shoes"],
        ["Subtotal ($)", "37.65"],
        ["Tax", "$2.07"],
        ["Total", `${PREFIX}39.72`],
        ["Discount ($)", "empty"],
        ["Created At", "February 11, 2028, 9:40 PM"],
        ["Quantity", "two"],
        ["Order image", ORDER_IMAGE],
        ["Product image", PRODUCT_IMAGE],
        ["Products → Category", "Widget"],
        ["Products → Created At", "December 31, 2026, 2:41 PM"],
        ["Products → Ean", "8833419218504"],
        ["Products → Price", "25.1"],
        ["Products → Rating", "4"],
        ["Products → Title", "Awesome Concrete Shoes"],
        ["Products → Vendor", "McClure-Lockman"],
      ]);
    });

    it("shows the image column in the header", () => {
      const header = screen.getByTestId("detail-view-header");

      expect(within(header).getByRole("img")).toHaveAttribute(
        "src",
        ORDER_IMAGE,
      );
      expect(
        within(header).getByRole("heading", {
          name: "Awesome Concrete Shoes",
          level: 1,
        }),
      ).toBeInTheDocument();
      expect(
        within(header).getByRole("heading", { name: "1", level: 2 }),
      ).toBeInTheDocument();
    });

    it("links a remapped foreign key to the related row", async () => {
      expect(
        await within(getDetailRowValue("User")).findByRole("link", {
          name: "Hudson Borer",
        }),
      ).toHaveAttribute("href", `/table/${PEOPLE_ID}/detail/1`);
    });

    it("renders a custom link for a column viewed as a link", () => {
      const link = within(getDetailRowValue("Product")).getByRole("link", {
        name: "Product: Awesome Concrete Shoes",
      });

      expect(link).toHaveAttribute("href", "https://example.com/14");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders an image in a frame with a link for a column viewed as an image", () => {
      const value = getDetailRowValue("Product image");

      expect(within(value).getByRole("img")).toHaveAttribute(
        "src",
        PRODUCT_IMAGE,
      );

      const link = within(value).getByRole("link");
      expect(link).toHaveTextContent(PRODUCT_IMAGE);
      expect(link).toHaveAttribute("href", PRODUCT_IMAGE);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });
});
