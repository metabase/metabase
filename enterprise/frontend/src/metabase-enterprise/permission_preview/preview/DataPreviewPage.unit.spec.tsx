import userEvent from "@testing-library/user-event";

import {
  setupGroupsEndpoint,
  setupPermissionPreviewAttributesEndpoint,
  setupPermissionPreviewDataEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockUserListResult } from "metabase-types/api/mocks";

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
    member_count: null,
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
            database_name: "Sample Database",
            table_name: "Products",
            rows: null,
            filters: [
              {
                attribute: "category",
                value: "Gizmo",
                each_member: false,
                column: "Products.Category",
              },
            ],
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
  setupUsersEndpoints([
    createMockUserListResult({ id: 3, common_name: "Sandy Sales" }),
  ]);
  setupGroupsEndpoint([]);
  setupPermissionPreviewDataEndpoint(DATA_PREVIEW);
  setupPermissionPreviewAttributesEndpoint([]);

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

  it("explains a table's value with its row security and the group that applies", async () => {
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
        "Sandy Sales sees only the Products rows that match the user attributes below.",
      ),
    ).toBeInTheDocument();
    expect(
      within(sidesheet).getByLabelText("Row and column security"),
    ).toHaveTextContent(
      "Set bySalesRowscategoryGizmo→ Products.CategoryColumnsAll columns.",
    );
    expect(within(sidesheet).getByLabelText("Groups")).toHaveTextContent(
      "SalesAppliesRow and column securityAll UsersBlockedThe most permissive group applies.",
    );
  });

  it("marks the value the sheet explains, and leaves the grid reachable behind it", async () => {
    setup({
      initialRoute: "/admin/permissions/data/preview/user/3/database/1",
    });

    const row = await screen.findByRole("row", {
      name: "Products permissions",
    });
    const value = within(row).getAllByTestId("permissions-select")[0];
    expect(value).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(value);

    expect(await screen.findByRole("dialog")).toHaveAttribute(
      "aria-modal",
      "false",
    );
    expect(value).toHaveAttribute("aria-pressed", "true");
  });
});
