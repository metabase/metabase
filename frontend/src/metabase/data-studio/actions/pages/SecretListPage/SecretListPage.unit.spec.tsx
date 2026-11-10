import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ReactNode } from "react";

import { setupActionSecretsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { ActionSecret } from "metabase-types/api";
import {
  createMockActionSecret,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { SecretListPage } from "./SecretListPage";

type MockTreeTableRow = {
  id: string;
  getVisibleCells: () => Array<{
    id: string;
    column: { columnDef: { cell?: unknown } };
    getContext: () => unknown;
  }>;
};

type MockTreeTableInstance = {
  table: { getRowModel: () => { rows: MockTreeTableRow[] } };
};

jest.mock("metabase/ui/components/data-display/TreeTable/TreeTable", () => {
  const { flexRender } = jest.requireActual("@tanstack/react-table");
  return {
    TreeTable: ({
      instance,
      emptyState,
    }: {
      instance: MockTreeTableInstance;
      emptyState: ReactNode;
    }) => {
      const rows = instance.table.getRowModel().rows;
      if (rows.length === 0) {
        return <div>{emptyState}</div>;
      }
      return (
        <div>
          {rows.map((row) => (
            <div key={row.id} data-testid="secret-row">
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

const CRM_TOKEN = createMockActionSecret({
  id: 1,
  name: "crm_token",
  allowed_hosts: ["api.example.com", "crm.example.com"],
  creator: createMockUserInfo({ common_name: "Test User" }),
});

const SLACK_URL = createMockActionSecret({
  id: 2,
  name: "slack_url",
  allowed_hosts: ["hooks.example.com"],
});

type SetupOpts = {
  secrets?: ActionSecret[];
};

function setup({ secrets = [CRM_TOKEN, SLACK_URL] }: SetupOpts = {}) {
  setupActionSecretsEndpoints(secrets);
  renderWithProviders(
    <Route path="/data-studio/actions/secrets" element={<SecretListPage />} />,
    { withRouter: true, initialRoute: "/data-studio/actions/secrets" },
  );
}

async function getRequestBody(name: string) {
  await waitFor(() => expect(fetchMock.callHistory.called(name)).toBe(true));
  const body: unknown = await fetchMock.callHistory
    .lastCall(name)
    ?.request?.json();
  return body;
}

describe("SecretListPage", () => {
  it("lists secrets with their creators and filters them by search", async () => {
    setup();

    expect(await screen.findByText("crm_token")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getAllByTestId("secret-row")).toHaveLength(2);

    await userEvent.type(screen.getByPlaceholderText("Search..."), "slack");

    expect(screen.getAllByTestId("secret-row")).toHaveLength(1);
    expect(screen.getByText("slack_url")).toBeInTheDocument();
  });

  it("says there are no secrets yet", async () => {
    setup({ secrets: [] });

    expect(await screen.findByText("No secrets yet")).toBeInTheDocument();
  });

  it("creates secret with one allowed host per line", async () => {
    setup();

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));
    const dialog = await screen.findByRole("dialog", { name: "New secret" });
    await userEvent.type(within(dialog).getByLabelText(/Name/), "stripe_key");
    await userEvent.type(within(dialog).getByLabelText(/Value/), "abc");
    await userEvent.type(
      within(dialog).getByLabelText(/Allowed hosts/),
      " api.example.com {enter}{enter}files.example.com",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await getRequestBody("action-secret-post")).toEqual({
      name: "stripe_key",
      value: "abc",
      allowed_hosts: ["api.example.com", "files.example.com"],
    });
  });

  it("does not create secret without allowed host or with invalid name", async () => {
    setup();

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));
    const dialog = await screen.findByRole("dialog", { name: "New secret" });
    await userEvent.type(within(dialog).getByLabelText(/Name/), "not.valid");
    await userEvent.type(within(dialog).getByLabelText(/Value/), "abc");

    expect(
      await within(dialog).findByText(
        "must contain only letters, digits and underscores",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("keeps value of edited secret when its value is left empty", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "crm_token options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Edit/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit secret" });
    expect(within(dialog).getByLabelText(/Allowed hosts/)).toHaveValue(
      "api.example.com\ncrm.example.com",
    );
    await userEvent.type(within(dialog).getByLabelText(/Name/), "_v2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await getRequestBody("action-secret-1-put")).toEqual({
      name: "crm_token_v2",
      allowed_hosts: ["api.example.com", "crm.example.com"],
    });
  });

  it("deletes secret after confirmation", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "slack_url options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete slack_url?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() =>
      expect(fetchMock.callHistory.called("action-secret-2-delete")).toBe(true),
    );
  });
});
