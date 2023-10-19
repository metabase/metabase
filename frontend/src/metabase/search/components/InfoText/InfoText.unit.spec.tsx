import { waitFor } from "@testing-library/react";
import {
  setupDatabaseEndpoints,
  setupTableEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { SearchModelType, SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import type { IconName } from "metabase/core/components/Icon";
import type { WrappedResult } from "metabase/search/types";
import { InfoText } from "./InfoText";

const MOCK_COLLECTION = createMockCollection({
  id: 1,
  name: "Collection Name",
});
const MOCK_TABLE = createMockTable({ id: 1, display_name: "Table Name" });
const MOCK_DATABASE = createMockDatabase({ id: 1, name: "Database Name" });

const MOCK_USER = createMockUser();
const MOCK_OTHER_USER = createMockUser({ id: 2, common_name: "John Cena" });

const createSearchResult = (model: SearchModelType) =>
  createMockSearchResult({
    collection: MOCK_COLLECTION,
    database_id: MOCK_DATABASE.id,
    created_at: "2022-01-01T00:00:00.000Z",
    creator_common_name: MOCK_USER.common_name,
    creator_id: MOCK_USER.id,
    last_edited_at: "2023-01-01T00:00:00.000Z",
    last_editor_common_name: MOCK_OTHER_USER.common_name,
    last_editor_id: MOCK_OTHER_USER.id,
    model,
  });

async function setup({
  model = "card",
  result = createSearchResult(model),
  isCompact = false,
  resultProps = {},
}: {
  model?: SearchModelType;
  result?: SearchResult;
  isCompact?: boolean;
  resultProps?: Partial<WrappedResult>;
}) {
  setupTableEndpoints(MOCK_TABLE);
  setupDatabaseEndpoints(MOCK_DATABASE);
  setupUsersEndpoints([MOCK_USER]);

  const getUrl = jest.fn(() => "a/b/c");
  const getIcon = jest.fn(() => ({
    name: "eye" as IconName,
    size: 14,
    width: 14,
    height: 14,
  }));
  const getCollection = jest.fn(() => result.collection);

  const wrappedResult: WrappedResult = {
    ...result,
    getUrl,
    getIcon,
    getCollection,
    ...resultProps,
  };

  renderWithProviders(
    <InfoText result={wrappedResult} isCompact={isCompact} />,
  );

  await waitFor(() =>
    expect(screen.queryByTestId("loading-text")).not.toBeInTheDocument(),
  );

  return {
    getUrl,
    getIcon,
    getCollection,
  };
}

describe("InfoText", () => {
  it("shows collection info for a question", async () => {
    await setup({
      model: "card",
    });
    expect(screen.getByText("Saved question in")).toHaveTextContent(
      "Collection Name",
    );
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("shows collection info for a collection", async () => {
    await setup({
      model: "card",
    });
    expect(screen.getByText("Saved question in")).toHaveTextContent(
      "Collection Name",
    );
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("shows Database for databases", async () => {
    await setup({
      model: "database",
    });
    expect(screen.getByText("Database")).toBeInTheDocument();
  });

  it("shows segment's table name", async () => {
    await setup({
      model: "segment",
      table_id: 1,
      database_id: 1,
    });

    expect(await screen.findByText("Table Name")).toBeInTheDocument();
    expect(await screen.findByText("Segment of")).toHaveTextContent(
      "Segment of Table Name",
    );
  });

  it("shows metric's table name", async () => {
    await setup({
      model: "metric",
      table_id: 1,
      database_id: 1,
    });

    expect(await screen.findByText("Table Name")).toBeInTheDocument();
    expect(await screen.findByText("Metric for")).toHaveTextContent(
      "Metric for Table Name",
    );
  });

  it("shows table's schema", async () => {
    await setup({
      model: "table",
      table_id: 1,
      database_id: 1,
    });

    expect(await screen.findByText("Database Name")).toBeInTheDocument();
    expect(await screen.findByText("Table in")).toHaveTextContent(
      "Table in Database Name",
    );
  });

  it("shows pulse's collection", async () => {
    await setup({
      model: "pulse",
      getCollection: () => MOCK_COLLECTION,
    });

    expect(screen.getByText("Pulse in")).toHaveTextContent(
      "Pulse in Collection Name",
    );
  });

  it("shows dashboard's collection", async () => {
    await setup({
      model: "dashboard",
      getCollection: () => MOCK_COLLECTION,
    });

    expect(screen.getByText("Dashboard in")).toHaveTextContent(
      "Dashboard in Collection Name",
    );
  });
});
