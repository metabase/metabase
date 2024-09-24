import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import register from "metabase/visualizations/register";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { ResultItem, type ResultItemType } from "./ResultItem";

function setup({
  item,
  isSelected = false,
  onClick = jest.fn(),
}: {
  item: ResultItemType;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const tokenFeatures = createMockTokenFeatures({
    content_verification: true,
    official_collections: true,
  });
  const settings = createMockSettings();

  const settingValuesWithToken = {
    ...settings,
    "token-features": tokenFeatures,
  };

  const state = createMockState({
    settings: mockSettings(settingValuesWithToken),
  });

  setupEnterprisePlugins();

  return renderWithProviders(
    <ResultItem item={item} isSelected={isSelected} onClick={onClick} />,
    { storeInitialState: state },
  );
}

const collectionItemWithInvalidParent: ResultItemType = {
  id: 301,
  model: "collection",
  name: "Foo Collection",
  description: "",
  collection: { name: "should not show this collection", id: 301 },
  collection_authority_level: null,
  moderated_status: null,
  display: null,
};

const collectionItemWithValidParent: ResultItemType = {
  id: 302,
  model: "collection",
  name: "Foo Collection",
  description: "",
  collection: { name: "should show this collection", id: 303 },
  collection_authority_level: null,
  moderated_status: null,
  display: null,
};

const questionItem: ResultItemType = {
  model: "card",
  name: "My Bar Chart",
  description: "",
  collection: { name: "My parent collection", id: 101 },
  collection_authority_level: null,
  moderated_status: null,
  display: "bar",
};

const dashboardItem: ResultItemType = {
  model: "dashboard",
  name: "My Awesome Dashboard ",
  description: "This dashboard contains awesome stuff",
  collection: { name: "My parent collection", id: 101 },
  collection_authority_level: null,
  moderated_status: null,
  display: null,
};

const questionInOfficialCollection: ResultItemType = {
  model: "card",
  name: "My Line Chart",
  description: "",
  collection: {
    name: "My official parent collection",
    id: 101,
    authority_level: "official",
  },
  collection_authority_level: "official",
  moderated_status: null,
  display: "line",
};

const verifiedModelItem: ResultItemType = {
  model: "dataset",
  name: "My Verified Model",
  description: "",
  collection: { name: "My parent collection", id: 101 },
  collection_authority_level: null,
  moderated_status: "verified",
  display: null,
};

const tableItem: ResultItemType = {
  model: "table",
  name: "My Flat Table",
  database_name: "My Database",
};

const tableItemWithSchema: ResultItemType = {
  ...tableItem,
  table_schema: "my_schema",
};

const tableItemWithEmptySchema: ResultItemType = {
  ...tableItem,
  table_schema: "",
};

describe("EntityPicker > ResultItem", () => {
  beforeAll(() => {
    register();
  });

  it("should render a collection item ignoring an invalid parent", () => {
    setup({
      item: collectionItemWithInvalidParent,
    });
    expect(screen.getByText("Foo Collection")).toBeInTheDocument();
    expect(screen.queryByText(/should not show/i)).not.toBeInTheDocument();
    expect(getIcon("folder")).toBeInTheDocument();
  });

  it("should render a collection item with parent", () => {
    setup({
      item: collectionItemWithValidParent,
    });
    expect(screen.getByText("Foo Collection")).toBeInTheDocument();
    expect(screen.getByText(/should show/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText("folder icon")).toHaveLength(2);
  });

  it("should render a bar chart item", () => {
    setup({
      item: questionItem,
    });
    expect(screen.getByText("My Bar Chart")).toBeInTheDocument();
    expect(getIcon("bar")).toBeInTheDocument();

    expect(screen.getByText("in My parent collection")).toBeInTheDocument();
  });

  it("should render a dashboard item", () => {
    setup({
      item: dashboardItem,
    });
    expect(screen.getByText("My Awesome Dashboard")).toBeInTheDocument();

    expect(getIcon("dashboard")).toBeInTheDocument();
    expect(screen.getByText("in My parent collection")).toBeInTheDocument();
  });

  it("should render an info icon when an item lacks a description", () => {
    setup({
      item: dashboardItem,
    });

    expect(getIcon("info")).toBeInTheDocument();
  });

  it("should not render an info icon when an item has a description", () => {
    setup({
      item: questionItem,
    });

    expect(queryIcon("info")).not.toBeInTheDocument();
  });

  it("should render a line chart item in an official collection", () => {
    setup({
      item: questionInOfficialCollection,
    });
    expect(screen.getByText("My Line Chart")).toBeInTheDocument();
    expect(getIcon("line")).toBeInTheDocument();

    expect(
      screen.getByText("in My official parent collection"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("in My official parent collection"),
    ).toBeInTheDocument();
    expect(getIcon("verified_collection")).toBeInTheDocument();
  });

  it("should render a verified model item", () => {
    setup({
      item: verifiedModelItem,
    });
    expect(screen.getByText("My Verified Model")).toBeInTheDocument();

    expect(getIcon("model_with_badge")).toBeInTheDocument();
    expect(screen.getByText("in My parent collection")).toBeInTheDocument();
  });

  it("should render a table model item", () => {
    setup({
      item: tableItem,
    });
    expect(screen.getByText(tableItem.name)).toBeInTheDocument();

    expect(getIcon("table")).toBeInTheDocument();
    expect(getIcon("database")).toBeInTheDocument();
    expect(
      screen.getByText(`in ${tableItem.database_name}`),
    ).toBeInTheDocument();
  });

  it("should display table schema when available (metabase#44460)", () => {
    setup({
      item: tableItemWithSchema,
    });
    expect(screen.getByText(tableItem.name)).toBeInTheDocument();

    expect(getIcon("table")).toBeInTheDocument();
    expect(getIcon("database")).toBeInTheDocument();
    expect(
      screen.getByText(`in ${tableItem.database_name} (My Schema)`),
    ).toBeInTheDocument();
  });

  it("should not display empty table schema", () => {
    setup({
      item: tableItemWithEmptySchema,
    });
    expect(screen.getByText(tableItem.name)).toBeInTheDocument();

    expect(getIcon("table")).toBeInTheDocument();
    expect(getIcon("database")).toBeInTheDocument();
    expect(
      screen.getByText(`in ${tableItem.database_name}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(`in ${tableItem.database_name} ()`),
    ).not.toBeInTheDocument();
  });
});
