import { waitFor } from "@testing-library/react";
import moment from "moment"; // eslint-disable-line no-restricted-imports -- deprecated usage

import {
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
  setupTableEndpoints,
  setupUserRecipientsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { WrappedResult } from "metabase/search/types";
import type { IconName } from "metabase/ui";
import type { SearchModel, SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { InfoText } from "./InfoText";

const MOCK_COLLECTION = createMockCollection({
  id: 1,
  name: "Collection Name",
});
const MOCK_TABLE = createMockTable({ id: 1, display_name: "Table Name" });
const MOCK_DATABASE = createMockDatabase({ id: 1, name: "Database Name" });
const MOCK_USER = createMockUser();
const MOCK_OTHER_USER = createMockUser({
  id: 2,
  first_name: "John",
  last_name: "Cena",
  common_name: "John Cena",
});

const CREATED_AT_TIME = "2022-01-01T00:00:00.000Z";
const LAST_EDITED_TIME = "2023-01-01T00:00:00.000Z";
const formatDuration = (timestamp: string) => moment(timestamp).fromNow();

const CREATED_AT_DURATION = formatDuration(CREATED_AT_TIME);
const LAST_EDITED_DURATION = formatDuration(LAST_EDITED_TIME);

const createSearchResult = ({
  model,
  ...resultProps
}: {
  model: SearchModel;
} & Partial<SearchResult>) =>
  createMockSearchResult({
    collection: MOCK_COLLECTION,
    database_id: MOCK_DATABASE.id,
    created_at: CREATED_AT_TIME,
    creator_common_name: MOCK_USER.common_name,
    creator_id: MOCK_USER.id,
    last_edited_at: LAST_EDITED_TIME,
    last_editor_common_name: MOCK_OTHER_USER.common_name,
    last_editor_id: MOCK_OTHER_USER.id,
    model,
    ...resultProps,
  });

async function setup({
  model = "card",
  isCompact = false,
  resultProps = {},
}: {
  model?: SearchModel;
  isCompact?: boolean;
  resultProps?: Partial<SearchResult>;
} = {}) {
  setupTableEndpoints(MOCK_TABLE);
  setupDatabaseEndpoints(MOCK_DATABASE);
  setupUsersEndpoints([MOCK_USER, MOCK_OTHER_USER]);
  setupCollectionByIdEndpoint({
    collections: [MOCK_COLLECTION],
  });
  setupUserRecipientsEndpoint({ users: [MOCK_USER, MOCK_OTHER_USER] });

  const result = createSearchResult({ model, ...resultProps });

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
  };

  renderWithProviders(
    <InfoText result={wrappedResult} isCompact={isCompact} />,
  );

  await waitFor(() =>
    expect(
      screen.queryByTestId("info-text-asset-link-loading-text"),
    ).not.toBeInTheDocument(),
  );

  // await waitforAssetLinkLoadingTextToBeRemoved()
  await waitForLoadingTextToBeRemoved();

  return {
    getUrl,
    getIcon,
    getCollection,
  };
}

describe("InfoText", () => {
  describe("showing relevant information for each model type", () => {
    it("shows collection info for a question", async () => {
      await setup({
        model: "card",
      });

      const collectionLink = screen.getByText("Collection Name");
      expect(collectionLink).toBeInTheDocument();
      expect(collectionLink).toHaveAttribute(
        "href",
        `/collection/${MOCK_COLLECTION.id}-collection-name`,
      );

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });

    it("shows collection info for a collection", async () => {
      await setup({
        model: "collection",
      });
      const collectionElement = screen.getByText("Collection");
      expect(collectionElement).toBeInTheDocument();

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });

    it("shows Database for databases", async () => {
      await setup({
        model: "database",
      });
      expect(screen.getByText("Database")).toBeInTheDocument();
      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });

    it("shows segment's table name", async () => {
      await setup({
        model: "segment",
      });

      const tableLink = screen.getByText(MOCK_TABLE.display_name);
      expect(tableLink).toHaveAttribute(
        "href",
        `/question#?db=${MOCK_DATABASE.id}&table=${MOCK_TABLE.id}`,
      );

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });

    it("shows metric's table name", async () => {
      await setup({
        model: "metric",
      });

      const tableLink = screen.getByText(MOCK_TABLE.display_name);
      expect(tableLink).toHaveAttribute(
        "href",
        `/question#?db=${MOCK_DATABASE.id}&table=${MOCK_TABLE.id}`,
      );

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });

    it("shows table's schema", async () => {
      await setup({
        model: "table",
      });

      const databaseLink = screen.getByText("Database Name");
      expect(databaseLink).toBeInTheDocument();
      expect(databaseLink).toHaveAttribute(
        "href",
        `/browse/databases/${MOCK_DATABASE.id}-database-name`,
      );

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });

    it("shows dashboard's collection", async () => {
      await setup({
        model: "dashboard",
      });

      const collectionLink = screen.getByText("Collection Name");
      expect(collectionLink).toBeInTheDocument();
      expect(collectionLink).toHaveAttribute(
        "href",
        `/collection/${MOCK_COLLECTION.id}-collection-name`,
      );

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });
  });

  describe("showing last_edited_by vs created_by", () => {
    it("should show last_edited_by when available", async () => {
      await setup();

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION} by ${MOCK_OTHER_USER.common_name}`,
      );
    });

    it("should show created_by when last_edited_at is not available", async () => {
      await setup({
        resultProps: {
          last_edited_at: null,
          last_editor_id: null,
          created_at: null,
        },
      });

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Created by you`,
      );
    });

    it("should not show user when neither last_edited_by and created_by are available", async () => {
      await setup({
        resultProps: {
          last_editor_id: null,
          last_edited_at: null,
          creator_id: null,
        },
      });

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Created ${CREATED_AT_DURATION}`,
      );
    });

    it("should not show user when last_edited_by isn't available but last_edited_at is", async () => {
      await setup({
        resultProps: {
          last_editor_id: null,
          creator_id: null,
        },
      });

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });
  });

  describe("showing last_edited_at vs created_at", () => {
    it("should show last_edited_at time when available", async () => {
      await setup({
        resultProps: {
          last_editor_id: null,
        },
      });

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Updated ${LAST_EDITED_DURATION}`,
      );
    });

    it("should show created time when last_edited_at is not available", async () => {
      await setup({
        resultProps: {
          last_edited_at: null,
          last_editor_id: null,
          creator_id: null,
        },
      });

      expect(screen.getByTestId("revision-history-button")).toHaveTextContent(
        `Created ${CREATED_AT_DURATION}`,
      );
    });

    it("should not show timestamp if neither last_edited_at or created_at is available", async () => {
      await setup({
        resultProps: {
          last_edited_at: null,
          last_editor_id: null,
          created_at: null,
          creator_id: null,
        },
      });

      expect(screen.queryByText("•")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("revision-history-button"),
      ).not.toBeInTheDocument();
    });
  });
});

async function waitForLoadingTextToBeRemoved() {
  await waitFor(() => {
    expect(
      screen.queryByTestId("info-text-asset-link-loading-text"),
    ).not.toBeInTheDocument();
  });

  await waitFor(() => {
    expect(
      screen.queryByTestId("last-edited-info-loading-text"),
    ).not.toBeInTheDocument();
  });
}
