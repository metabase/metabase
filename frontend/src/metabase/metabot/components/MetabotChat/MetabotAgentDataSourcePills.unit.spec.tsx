import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import type {
  MetabotCodeEdit,
  MetabotCodeEditorBufferContext,
  TemplateTags,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  CodeEditTablePills,
  NavigateToTablePills,
} from "./MetabotAgentDataSourcePills";

const SOURCE_FEEDBACK_ENDPOINT = "path:/api/metabot/source-feedback";
const EXTRACT_SOURCES_ENDPOINT = "path:/api/llm/extract-sources";
const FIELD_TABLE_IDS_ENDPOINT = "path:/api/field/table-ids";

const ORDERS_TABLE = createMockTable({
  id: 2,
  db_id: 1,
  name: "ORDERS",
  display_name: "Orders",
});
const PRODUCTS_TABLE = createMockTable({
  id: 3,
  db_id: 1,
  name: "PRODUCTS",
  display_name: "Products",
});
const DATABASE = createMockDatabase({ id: 1, name: "Sample Database" });

const CODE_EDIT_VALUE: MetabotCodeEdit = {
  buffer_id: "qb",
  mode: "rewrite",
  value: "SELECT * FROM ORDERS",
};
const CODE_EDIT_BUFFER: MetabotCodeEditorBufferContext = {
  id: "qb",
  source: {
    language: "sql",
    database_id: 1,
  },
  cursor: { line: 1, column: 1 },
};

const createQuestionPath = (datasetQuery: Record<string, unknown>) =>
  `/question#${btoa(JSON.stringify({ dataset_query: datasetQuery }))}`;

const createMbqlPath = (query: Record<string, unknown>, database = 1) =>
  createQuestionPath({
    type: "query",
    database,
    query,
  });

const createNativePath = (
  sql = "SELECT * FROM ORDERS",
  database = 1,
  templateTags?: TemplateTags,
) =>
  createQuestionPath({
    type: "native",
    database,
    native: {
      query: sql,
      ...(templateTags ? { "template-tags": templateTags } : {}),
    },
  });

const setupTableEndpoints = (...tables: (typeof ORDERS_TABLE)[]) => {
  tables.forEach((table) => {
    fetchMock.get(`path:/api/table/${table.id}`, table);
  });
  fetchMock.get("path:/api/database/1", DATABASE);
};

const setupNativeEndpoints = ({ delay = 0 }: { delay?: number } = {}) => {
  fetchMock.post(
    EXTRACT_SOURCES_ENDPOINT,
    {
      tables: [
        {
          id: ORDERS_TABLE.id,
          name: ORDERS_TABLE.name,
          schema: ORDERS_TABLE.schema,
          display_name: ORDERS_TABLE.display_name,
          description: null,
          columns: [],
        },
      ],
      card_ids: [],
    },
    { delay },
  );
  fetchMock.get("path:/api/database/1", DATABASE);
};

const renderCodeEditPills = (messageId = "message-1") => {
  setupNativeEndpoints();

  return renderWithProviders(
    <CodeEditTablePills
      buffer={CODE_EDIT_BUFFER}
      messageId={messageId}
      value={CODE_EDIT_VALUE}
    />,
  );
};

const renderMbqlPills = ({
  messageId = "message-1",
  query,
}: {
  messageId?: string;
  query: Record<string, unknown>;
}) =>
  renderWithProviders(
    <NavigateToTablePills messageId={messageId} path={createMbqlPath(query)} />,
  );

describe("MetabotAgentDataSourcePills", () => {
  it("sends a feedback request when clicking source feedback buttons", async () => {
    fetchMock.post(SOURCE_FEEDBACK_ENDPOINT, 204);
    renderCodeEditPills("message-1");

    await userEvent.click(
      await screen.findByRole("button", { name: "Source is correct" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT, {
          body: {
            metabot_id: FIXED_METABOT_IDS.DEFAULT,
            message_id: "message-1",
            source_id: ORDERS_TABLE.id,
            source_type: "table",
            positive: true,
          },
        }),
      ).toHaveLength(1),
    );
  });

  it("sends a feedback request when changing an already selected source", async () => {
    fetchMock.post(SOURCE_FEEDBACK_ENDPOINT, 204);
    renderCodeEditPills("message-2");

    await userEvent.click(
      await screen.findByRole("button", { name: "Source is correct" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT),
      ).toHaveLength(1),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Source is wrong" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT),
      ).toHaveLength(2),
    );
    expect(
      fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT, {
        body: {
          metabot_id: FIXED_METABOT_IDS.DEFAULT,
          message_id: "message-2",
          source_id: ORDERS_TABLE.id,
          source_type: "table",
          positive: false,
        },
      }),
    ).toHaveLength(1);
  });

  it("does not send feedback again when clicking the selected dislike button", async () => {
    fetchMock.post(SOURCE_FEEDBACK_ENDPOINT, 204);
    renderCodeEditPills("message-3");

    const dislikeButton = await screen.findByRole("button", {
      name: "Source is wrong",
    });
    await userEvent.click(dislikeButton);
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT, {
          body: {
            metabot_id: FIXED_METABOT_IDS.DEFAULT,
            message_id: "message-3",
            source_id: ORDERS_TABLE.id,
            source_type: "table",
            positive: false,
          },
        }),
      ).toHaveLength(1),
    );

    await userEvent.click(dislikeButton);

    expect(fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT)).toHaveLength(
      1,
    );
  });

  it("parses MBQL source tables and resolves field table ids with dedupe", async () => {
    setupTableEndpoints(ORDERS_TABLE, PRODUCTS_TABLE);
    fetchMock.post(FIELD_TABLE_IDS_ENDPOINT, {
      table_ids: [ORDERS_TABLE.id, PRODUCTS_TABLE.id, PRODUCTS_TABLE.id],
    });

    renderMbqlPills({
      messageId: "message-4",
      query: {
        "source-table": ORDERS_TABLE.id,
        fields: [
          ["field", 10, null],
          ["field", 11, null],
        ],
      },
    });

    expect(
      await screen.findByRole("link", { name: "Orders" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Products" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Orders" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Products" })).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls(FIELD_TABLE_IDS_ENDPOINT, {
        body: { field_ids: [10, 11] },
      }),
    ).toHaveLength(1);
  });

  it("parses native SQL queries and requests extracted sources", async () => {
    const sql = "SELECT * FROM ORDERS";
    setupNativeEndpoints();

    renderWithProviders(
      <NavigateToTablePills
        messageId="message-5"
        path={createNativePath(sql)}
      />,
    );

    expect(
      await screen.findByRole("link", { name: "Orders" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(EXTRACT_SOURCES_ENDPOINT, {
        body: {
          database_id: 1,
          sql,
        },
      }),
    ).toHaveLength(1);
  });

  it("renders extracted native query model sources", async () => {
    const sql = "SELECT * FROM {{#4-revenue_model}}";
    const templateTags: TemplateTags = {
      "#4-revenue_model": {
        id: "1",
        name: "#4-revenue_model",
        "display-name": "Revenue Model",
        type: "card",
        "card-id": 4,
      },
    };
    fetchMock.post(EXTRACT_SOURCES_ENDPOINT, {
      tables: [],
      card_ids: [4],
    });
    fetchMock.get(
      "path:/api/card/4",
      createMockCard({ id: 4, name: "Revenue Model", type: "model" }),
    );
    fetchMock.get("path:/api/database/1", DATABASE);
    fetchMock.post(SOURCE_FEEDBACK_ENDPOINT, 204);

    renderWithProviders(
      <NavigateToTablePills
        messageId="message-5-model"
        path={createNativePath(sql, 1, templateTags)}
      />,
    );

    expect(
      await screen.findByRole("link", { name: "Revenue Model" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(EXTRACT_SOURCES_ENDPOINT, {
        body: {
          database_id: 1,
          sql,
          template_tags: templateTags,
        },
      }),
    ).toHaveLength(1);

    await userEvent.click(
      await screen.findByRole("button", { name: "Source is correct" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(SOURCE_FEEDBACK_ENDPOINT, {
          body: {
            metabot_id: FIXED_METABOT_IDS.DEFAULT,
            message_id: "message-5-model",
            source_id: 4,
            source_type: "model",
            positive: true,
          },
        }),
      ).toHaveLength(1),
    );
  });

  it("shows source links without feedback buttons when message id is not provided", async () => {
    setupNativeEndpoints();

    renderWithProviders(
      <NavigateToTablePills path={createNativePath("SELECT * FROM ORDERS")} />,
    );

    const sourceLink = await screen.findByRole("link", { name: "Orders" });

    expect(sourceLink).toHaveAttribute("href", "/question#?db=1&table=2");
    expect(
      screen.queryByLabelText("Source is correct"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Source is wrong")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton while resolving field table ids", async () => {
    setupTableEndpoints(ORDERS_TABLE);
    fetchMock.post(
      FIELD_TABLE_IDS_ENDPOINT,
      { table_ids: [ORDERS_TABLE.id] },
      { delay: 50 },
    );

    renderMbqlPills({
      messageId: "message-6",
      query: {
        fields: [["field", 10, null]],
      },
    });

    expect(
      await screen.findAllByTestId("metabot-source-item-skeleton"),
    ).not.toHaveLength(0);
    expect(
      await screen.findByRole("link", { name: "Orders" }),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton while loading table source details", async () => {
    fetchMock.get("path:/api/table/2", ORDERS_TABLE, { delay: 50 });
    fetchMock.get("path:/api/database/1", DATABASE);

    renderMbqlPills({
      messageId: "message-7",
      query: { "source-table": ORDERS_TABLE.id },
    });

    expect(
      await screen.findAllByTestId("metabot-source-item-skeleton"),
    ).not.toHaveLength(0);
    expect(
      await screen.findByRole("link", { name: "Orders" }),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton while loading card source details", async () => {
    fetchMock.get(
      "path:/api/card/4",
      createMockCard({ id: 4, name: "Revenue", type: "metric" }),
      { delay: 50 },
    );

    renderMbqlPills({
      messageId: "message-8",
      query: { "source-table": "card__4" },
    });

    expect(
      await screen.findAllByTestId("metabot-source-item-skeleton"),
    ).not.toHaveLength(0);
    expect(
      await screen.findByRole("link", { name: "Revenue" }),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton while extracting native SQL tables", async () => {
    setupNativeEndpoints({ delay: 50 });

    renderWithProviders(
      <NavigateToTablePills
        messageId="message-9"
        path={createNativePath("SELECT * FROM ORDERS")}
      />,
    );

    expect(
      await screen.findAllByTestId("metabot-source-item-skeleton"),
    ).not.toHaveLength(0);
    expect(
      await screen.findByRole("link", { name: "Orders" }),
    ).toBeInTheDocument();
  });
});
