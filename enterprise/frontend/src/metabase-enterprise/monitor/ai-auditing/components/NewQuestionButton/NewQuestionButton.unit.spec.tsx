import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { AUDIT_DB_ID } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/constants";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { NewQuestionButton } from "./NewQuestionButton";

const VIEW_NAME = "v_mcp_tool_calls";
const TABLE_ID = 3001;

const viewTable = createMockTable({
  id: TABLE_ID,
  db_id: AUDIT_DB_ID,
  schema: "public",
  name: VIEW_NAME,
  display_name: VIEW_NAME,
  fields: [
    createMockField({ id: TABLE_ID * 100, table_id: TABLE_ID, name: "tool" }),
  ],
});

const auditDatabase = createMockDatabase({
  id: AUDIT_DB_ID,
  tables: [viewTable],
});

function setup({ canQuery }: { canQuery: boolean }) {
  fetchMock.get(`path:/api/database/${AUDIT_DB_ID}/metadata`, auditDatabase);
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [auditDatabase],
    tables: [viewTable],
    fields: viewTable.fields ?? [],
  });
  fetchMock.get(
    {
      url: `path:/api/database/${AUDIT_DB_ID}/schema/public`,
      query: { "can-query": "true" },
    },
    canQuery ? [viewTable] : [],
  );

  renderWithProviders(<NewQuestionButton viewName={VIEW_NAME} />);
}

describe("NewQuestionButton", () => {
  it("links to a notebook question on the view when the user can query it", async () => {
    setup({ canQuery: true });

    const link = await screen.findByRole("link", { name: /New question/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("/question"));
  });

  it("is hidden when the user cannot query the view", async () => {
    setup({ canQuery: false });

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          `path:/api/database/${AUDIT_DB_ID}/schema/public`,
        ),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("link", { name: /New question/ }),
    ).not.toBeInTheDocument();
  });
});
