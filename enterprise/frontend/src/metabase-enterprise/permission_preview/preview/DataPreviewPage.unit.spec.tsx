import userEvent from "@testing-library/user-event";

import {
  setupPermissionPreviewDataEndpoint,
  setupPermissionPreviewPrincipalsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";

import type {
  PreviewCell,
  PreviewDataResponse,
  PreviewTableAccess,
} from "../api";

import { DataPreviewPage } from "./DataPreviewPage";

const ALL_USERS = { id: 1, name: "All Users" };
const SALES = { id: 5, name: "Sales" };

function createCell(allUsersValue: string, salesValue: string): PreviewCell {
  const isSalesWinner = salesValue !== allUsersValue;
  return {
    value: isSalesWinner ? salesValue : allUsersValue,
    group_id: isSalesWinner ? SALES.id : ALL_USERS.id,
    groups: [
      { group_id: ALL_USERS.id, name: ALL_USERS.name, value: allUsersValue },
      { group_id: SALES.id, name: SALES.name, value: salesValue },
    ],
    note: null,
  };
}

function createTable(
  table: Pick<PreviewTableAccess, "id" | "name" | "view_data" | "security">,
): PreviewTableAccess {
  return {
    schema: null,
    display_name: table.name,
    create_queries: createCell("no", "query-builder"),
    download_results: createCell("no", "one-million-rows"),
    manage_table_metadata: createCell("no", "no"),
    ...table,
  };
}

const DATA_PREVIEW: PreviewDataResponse = {
  principal: {
    type: "user",
    id: 3,
    name: "Sandy Sales",
    detail: "sandy@example.com",
    superuser: false,
    tenant_side: false,
    attributes: { category: "Gizmo" },
    groups: [ALL_USERS, SALES],
  },
  databases: [
    {
      id: 1,
      name: "Sample Database",
      reasons: [],
      manage_database: createCell("no", "no"),
      transforms: createCell("no", "no"),
      tables: [
        createTable({
          id: 1,
          name: "Orders",
          view_data: createCell("blocked", "unrestricted"),
          security: null,
        }),
        createTable({
          id: 2,
          name: "Products",
          view_data: createCell("blocked", "sandboxed"),
          security: {
            kind: "sandbox",
            group_id: SALES.id,
            group_name: SALES.name,
            rows: 'Filtered by the "category" attribute ("Gizmo").',
            columns: "All columns.",
          },
        }),
      ],
    },
  ],
};

type SetupOpts = {
  initialRoute: string;
};

function setup({ initialRoute }: SetupOpts) {
  setupPermissionPreviewPrincipalsEndpoint({
    users: [
      {
        id: 3,
        name: "Sandy Sales",
        detail: "sandy@example.com",
        tenant_side: false,
      },
    ],
    groups: [],
    tenants: [],
  });
  setupPermissionPreviewDataEndpoint(DATA_PREVIEW);

  renderWithProviders(
    <>
      <Route
        path="/admin/permissions/data/preview/:principalType/:principalId"
        element={<DataPreviewPage />}
      />
      <Route
        path="/admin/permissions/data/preview/:principalType/:principalId/database/:databaseId"
        element={<DataPreviewPage />}
      />
    </>,
    { withRouter: true, initialRoute },
  );
}

describe("DataPreviewPage", () => {
  it("shows Granular for a database whose tables differ, and the one value where they agree", async () => {
    setup({ initialRoute: "/admin/permissions/data/preview/user/3" });

    const row = await screen.findByRole("row", {
      name: "Sample Database permissions",
    });
    const [viewData, createQueries] =
      within(row).getAllByTestId("permissions-select");
    expect(viewData).toHaveTextContent("Granular");
    expect(createQueries).toHaveTextContent("Query builder only");
  });

  it("explains a table's value with its row and column security and the group that applies", async () => {
    setup({
      initialRoute: "/admin/permissions/data/preview/user/3/database/1",
    });

    const row = await screen.findByRole("row", {
      name: "Products permissions",
    });
    await userEvent.click(within(row).getByText("Row and column security"));

    const sidesheet = await screen.findByRole("dialog");
    expect(
      within(sidesheet).getByText("Products · View data"),
    ).toBeInTheDocument();
    expect(
      within(sidesheet).getByText(
        'Filtered by the "category" attribute ("Gizmo").',
      ),
    ).toBeInTheDocument();
    expect(within(sidesheet).getByLabelText("Groups")).toHaveTextContent(
      "All UsersBlockedSalesRow and column securityAppliesThe most permissive group applies.",
    );
  });
});
