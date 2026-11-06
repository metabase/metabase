import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
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

function setup() {
  fetchMock.get(`path:/api/database/${AUDIT_DB_ID}/metadata`, auditDatabase);
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [auditDatabase],
    tables: [viewTable],
    fields: viewTable.fields ?? [],
  });

  renderWithProviders(<NewQuestionButton viewName={VIEW_NAME} />);
}

describe("NewQuestionButton", () => {
  it("links to a notebook question on the view", async () => {
    setup();

    const link = await screen.findByRole("link", { name: /Query this data/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("/question"));
  });
});
