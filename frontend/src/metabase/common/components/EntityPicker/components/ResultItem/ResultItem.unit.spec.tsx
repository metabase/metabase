import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
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

const collectionItem: ResultItemType = {
  model: "collection",
  name: "Foo Collection",
  description: "",
  collection: { name: "should not show this collection", id: 0 },
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

describe("EntityPicker > ResultItem", () => {
  beforeAll(() => {
    register();
  });

  it("should render a collection item", () => {
    setup({
      item: collectionItem,
    });
    expect(screen.getByText("Foo Collection")).toBeInTheDocument();
    expect(screen.queryByText(/should not show/i)).not.toBeInTheDocument();
    expect(getIcon("folder")).toBeInTheDocument();
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
    expect(getIcon("badge")).toBeInTheDocument();
  });

  it("should render a verified model item", () => {
    setup({
      item: verifiedModelItem,
    });
    expect(screen.getByText("My Verified Model")).toBeInTheDocument();

    expect(getIcon("model_with_badge")).toBeInTheDocument();
    expect(screen.getByText("in My parent collection")).toBeInTheDocument();
  });
});
