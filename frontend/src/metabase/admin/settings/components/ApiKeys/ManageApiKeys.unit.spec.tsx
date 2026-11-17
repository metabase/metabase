import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGroupsEndpoint,
  setupStatefulApiKeyEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ManageApiKeys } from "metabase/admin/settings/components/ApiKeys/ManageApiKeys";
import type { ApiKey } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ id: 3, name: "foo" }),
  createMockGroup({ id: 4, name: "bar" }),
  createMockGroup({ id: 5, name: "flamingos" }),
];

const testApiKeys: ApiKey[] = [
  {
    name: "Development API Key",
    id: 1,
    group: {
      id: 1,
      name: "All Users",
    },
    creator_id: 1,
    masked_key: "mb_DevA****",
    created_at: "2010-08-10",
    updated_at: "2010-08-10",
    updated_by: {
      common_name: "John Doe",
      id: 10,
    },
  },
  {
    name: "Production API Key",
    id: 2,
    group: {
      id: 2,
      name: "Administrators",
    },
    creator_id: 1,
    masked_key: "mb_ProB****",
    created_at: "2010-08-10",
    updated_at: "2010-08-10",
    updated_by: {
      common_name: "Jane Doe",
      id: 11,
    },
  },
  {
    name: "Staging API Key",
    id: 3,
    group: {
      id: 3,
      name: "foo",
    },
    creator_id: 1,
    masked_key: "mb_StaC****",
    created_at: "2010-08-10",
    updated_at: "2010-08-10",
    updated_by: {
      common_name: "Bobby Tables",
      id: 12,
    },
  },
];

interface SetupOpts {
  apiKeys?: ApiKey[];
}

async function setup({ apiKeys = testApiKeys }: SetupOpts = {}) {
  // TreeTable virtualizes rows, so the container needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });
  setupGroupsEndpoint(GROUPS);
  const store = setupStatefulApiKeyEndpoints({ apiKeys, groups: GROUPS });
  renderWithProviders(<ManageApiKeys />);
  await waitForLoaderToBeRemoved();
  await waitFor(() => {
    expect(getListCalls()).toHaveLength(1);
  });
  return { store };
}

function getListCalls() {
  return fetchMock.callHistory.calls("path:/api/api-key", { method: "GET" });
}

async function openRowMenu(rowName: RegExp) {
  const row = await screen.findByRole("row", { name: rowName });
  await userEvent.click(within(row).getByLabelText("API key actions"));
}

async function fillCreateForm({
  name,
  group,
}: {
  name: string;
  group: string;
}) {
  await userEvent.click(
    within(screen.getByTestId("api-keys-settings-header")).getByRole("button", {
      name: "Create an API key",
    }),
  );
  expect(await screen.findByText("Create a new API key")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/Key name/), name);
  await userEvent.click(
    await screen.findByLabelText(/group this key should belong to/i),
  );
  await userEvent.click(await screen.findByText(group));

  // Blur the select
  await userEvent.click(await screen.findByText(/We don't version/));
  expect(
    await screen.findByRole("textbox", {
      name: /group this key should belong to/i,
    }),
  ).not.toHaveAttribute("data-error");

  const createButton = screen.getByRole("button", { name: "Create" });
  await waitFor(() => expect(createButton).toBeEnabled());
  await userEvent.click(createButton);
}

describe("ManageApiKeys", () => {
  it("should render the component", async () => {
    await setup();
    expect(
      within(screen.getByTestId("api-keys-settings-header")).getByText(
        "API keys",
      ),
    ).toBeInTheDocument();
  });

  it("should render component empty state", async () => {
    await setup({ apiKeys: [] });
    expect(screen.getByText("API keys")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("empty-table-warning")).getByText(
        "No API keys yet",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create an API key" }),
    ).toBeInTheDocument();
  });

  it("should load API keys from api", async () => {
    await setup();
    expect(await screen.findByText("Development API Key")).toBeInTheDocument();
  });

  it.each([
    {
      name: /development api key/i,
      group: "All Users",
      key: "mb_DevA...",
      modifier: "John Doe",
    },
    {
      name: /production api key/i,
      group: "Administrators",
      key: "mb_ProB...",
      modifier: "Jane Doe",
    },
    {
      name: /staging api key/i,
      group: "foo",
      key: "mb_StaC...",
      modifier: "Bobby Tables",
    },
  ])(
    "should list the group, masked key and modifier of $name in its row",
    async ({ name, group, key, modifier }) => {
      await setup();
      const table = screen.getByTestId("api-keys-table");
      const row = await within(table).findByRole("row", { name });

      expect(within(row).getByText(name)).toBeInTheDocument();
      expect(within(row).getByText(group)).toBeInTheDocument();
      expect(within(row).getByText(key)).toBeInTheDocument();
      expect(within(row).getByText(modifier)).toBeInTheDocument();
    },
  );

  it("should create a new API key, and show an error when its name is used again", async () => {
    await setup();
    await fillCreateForm({ name: "New key", group: "flamingos" });

    expect(
      await screen.findByText("Copy and save this API key"),
    ).toBeInTheDocument();
    const calls = fetchMock.callHistory.calls("path:/api/api-key", {
      method: "POST",
    });
    const lastCall = calls[calls.length - 1];
    expect(await lastCall?.request?.json()).toEqual({
      name: "New key",
      group_id: 5,
    });
    expect(screen.getByLabelText("The API key")).toHaveValue(
      `mb_1Key${"x".repeat(36)}`,
    );

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(getListCalls()).toHaveLength(2));
    const newRow = await within(
      screen.getByTestId("api-keys-table"),
    ).findByRole("row", { name: "New key" });
    expect(within(newRow).getByText("flamingos")).toBeInTheDocument();
    expect(within(newRow).getByText("mb_1Key...")).toBeInTheDocument();

    await fillCreateForm({ name: "New key", group: "bar" });

    const form = screen.getByTestId("create-api-key-modal");
    await waitFor(() => {
      expect(
        within(form)
          .getAllByRole("alert")
          .some((alert) =>
            alert.textContent?.includes(
              "An API key with this name already exists.",
            ),
          ),
      ).toBe(true);
    });
    const duplicateCall = fetchMock.callHistory.lastCall("path:/api/api-key", {
      method: "POST",
    });
    expect(await duplicateCall?.request?.json()).toEqual({
      name: "New key",
      group_id: 4,
    });
    expect(duplicateCall?.response?.status).toBe(400);
    expect(
      screen.queryByText("Copy and save this API key"),
    ).not.toBeInTheDocument();
  });

  it("should regenerate an API key", async () => {
    await setup();
    const REGEN_URL = "path:/api/api-key/2/regenerate";

    await openRowMenu(/production api key/i);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /edit/i }),
    );
    await screen.findByText("Edit API key");
    await userEvent.click(
      screen.getByRole("button", { name: "Regenerate API key" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Regenerate" }),
    );

    await screen.findByText("Copy and save this API key");
    expect(
      fetchMock.callHistory.called(REGEN_URL, { method: "PUT" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("The API key")).toHaveValue(
      `mb_1Key${"x".repeat(36)}`,
    );
    await waitFor(() => {
      expect(getListCalls()).toHaveLength(2);
    });

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    const table = screen.getByTestId("api-keys-table");
    const row = await within(table).findByRole("row", {
      name: /production api key/i,
    });
    expect(within(row).getByText("mb_1Key...")).toBeInTheDocument();
    expect(within(row).queryByText("mb_ProB...")).not.toBeInTheDocument();
    expect(
      within(
        within(table).getByRole("row", { name: /development api key/i }),
      ).getByText("mb_DevA..."),
    ).toBeInTheDocument();
  });

  it("should edit API key", async () => {
    await setup();
    const EDIT_URL = "path:/api/api-key/2";

    const table = screen.getByTestId("api-keys-table");
    expect(
      within(
        await within(table).findByRole("row", { name: /production api key/i }),
      ).getByText("Administrators"),
    ).toBeInTheDocument();

    await openRowMenu(/production api key/i);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /edit/i }),
    );
    await screen.findByText("Edit API key");

    const group = await screen.findByLabelText(
      /group this key should belong to/i,
    );
    await userEvent.click(group);
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText("bar"),
    );

    const keyName = screen.getByLabelText(/Key name/);
    await userEvent.clear(keyName);
    await userEvent.type(keyName, "Different key name");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      expect(
        await fetchMock.callHistory
          .lastCall(EDIT_URL, { method: "PUT" })
          ?.request?.json(),
      ).toEqual({ group_id: 4, name: "Different key name" });
    });
    await waitFor(() => {
      expect(getListCalls()).toHaveLength(2);
    });

    const renamedRow = await within(table).findByRole("row", {
      name: "Different key name",
    });
    expect(within(renamedRow).getByText("bar")).toBeInTheDocument();
    expect(
      within(table).queryByText("Production API Key"),
    ).not.toBeInTheDocument();
    expect(
      within(
        within(table).getByRole("row", { name: /development api key/i }),
      ).getByText("All Users"),
    ).toBeInTheDocument();
  });

  it("should open the edit modal when a row is clicked", async () => {
    await setup();
    await userEvent.click(
      await screen.findByRole("row", { name: /development api key/i }),
    );
    expect(await screen.findByText("Edit API key")).toBeInTheDocument();
  });

  it("should not open the edit modal when opening the actions menu", async () => {
    await setup();
    await openRowMenu(/development api key/i);
    expect(
      await screen.findByRole("menuitem", { name: /edit/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Edit API key")).not.toBeInTheDocument();
  });

  it("should delete API key", async () => {
    await setup();
    const DELETE_URL = "path:/api/api-key/2";

    await openRowMenu(/production api key/i);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /delete/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete API key" }),
    );
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(DELETE_URL, { method: "DELETE" }),
      ).toHaveLength(1);
    });
    await waitFor(() => {
      expect(getListCalls()).toHaveLength(2);
    });

    const table = screen.getByTestId("api-keys-table");
    await waitFor(() => {
      expect(
        within(table).queryByRole("row", { name: /production api key/i }),
      ).not.toBeInTheDocument();
    });
    expect(
      within(table).getByRole("row", { name: /development api key/i }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("row", { name: /staging api key/i }),
    ).toBeInTheDocument();
  });

  it("should show the empty state after deleting the last API key", async () => {
    const [, productionKey] = testApiKeys;
    await setup({ apiKeys: [productionKey] });

    await openRowMenu(/production api key/i);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /delete/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete API key" }),
    );

    expect(
      within(await screen.findByTestId("empty-table-warning")).getByText(
        "No API keys yet",
      ),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/api-key/2", { method: "DELETE" }),
    ).toHaveLength(1);
    expect(screen.queryByTestId("api-keys-table")).not.toBeInTheDocument();
  });
});
