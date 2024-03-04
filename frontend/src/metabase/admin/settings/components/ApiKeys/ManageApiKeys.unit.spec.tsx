import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupApiKeyEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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
    masked_key: "asdfasdfa",
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
    masked_key: "asdfasdfa",
    created_at: "2010-08-10",
    updated_at: "2010-08-10",
    updated_by: {
      common_name: "Jane Doe",
      id: 10,
    },
  },
];

async function setup(
  { apiKeys }: { apiKeys?: ApiKey[] } = { apiKeys: undefined },
) {
  setupGroupsEndpoint(GROUPS);
  setupApiKeyEndpoints(apiKeys ?? testApiKeys);
  renderWithProviders(<ManageApiKeys />);
  await waitFor(() => {
    expect(
      fetchMock.calls("path:/api/api-key", { method: "GET" }),
    ).toHaveLength(1);
  });
}
describe("ManageApiKeys", () => {
  it("should render the component", async () => {
    await setup();
    expect(screen.getByText("Manage API Keys")).toBeInTheDocument();
  });
  it("should render component empty state", async () => {
    await setup({ apiKeys: [] });
    expect(screen.getByText("Manage API Keys")).toBeInTheDocument();
    expect(screen.getByText("No API keys here yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can create an API key to make API calls programatically.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Create API Key")).toHaveLength(2);
  });
  it("should load API keys from api", async () => {
    await setup();
    expect(await screen.findByText("Development API Key")).toBeInTheDocument();
  });
  it("should create a new API key", async () => {
    await setup();
    userEvent.click(screen.getByText("Create API Key"));
    expect(await screen.findByText("Create a new API Key")).toBeInTheDocument();
    userEvent.type(screen.getByLabelText(/Key name/), "New key");
    userEvent.click(await screen.findByLabelText(/which group/i));
    userEvent.click(await screen.findByText("flamingos"));

    const createButton = screen.getByRole("button", { name: "Create" });
    await waitFor(() => expect(createButton).toBeEnabled());
    userEvent.click(createButton);

    expect(
      await screen.findByText("Copy and save the API key"),
    ).toBeInTheDocument();
    expect(
      await fetchMock
        .lastCall("path:/api/api-key", { method: "POST" })
        ?.request?.json(),
    ).toEqual({ name: "New key", group_id: 5 });

    userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(
        fetchMock.calls("path:/api/api-key", { method: "GET" }),
      ).toHaveLength(2),
    );
  });
  it("should regenerate an API key", async () => {
    await setup();
    const REGEN_URL = "path:/api/api-key/1/regenerate";
    fetchMock.put(REGEN_URL, 200);

    userEvent.click(
      within(
        await screen.findByRole("row", {
          name: /development api key/i,
        }),
      ).getByRole("img", { name: /pencil/i }),
    );
    await screen.findByText("Edit API Key");
    userEvent.click(screen.getByRole("button", { name: "Regenerate API Key" }));
    userEvent.click(await screen.findByRole("button", { name: "Regenerate" }));

    await screen.findByText("Copy and save the API key");
    expect(
      await fetchMock.lastCall(REGEN_URL, { method: "PUT" })?.request?.json(),
    ).toEqual({});
    await waitFor(() => {
      expect(
        fetchMock.calls("path:/api/api-key", { method: "GET" }),
      ).toHaveLength(2);
    });
  });
  it("should edit API key", async () => {
    await setup();
    const EDIT_URL = "path:/api/api-key/1";
    fetchMock.put(EDIT_URL, 200);

    userEvent.click(
      within(
        await screen.findByRole("row", {
          name: /development api key/i,
        }),
      ).getByRole("img", { name: /pencil/i }),
    );
    await screen.findByText("Edit API Key");

    const group = await screen.findByLabelText(/which group/i);
    userEvent.click(group);
    userEvent.click(await screen.findByText("flamingos"));

    const keyName = screen.getByLabelText("Key name");
    userEvent.clear(keyName);
    userEvent.type(keyName, "My Key");

    userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      expect(
        await fetchMock.lastCall(EDIT_URL, { method: "PUT" })?.request?.json(),
      ).toEqual({ group_id: 5, name: "My Key" });
    });
    await waitFor(() => {
      expect(
        fetchMock.calls("path:/api/api-key", { method: "GET" }),
      ).toHaveLength(2);
    });
  });
  it("should delete API key", async () => {
    await setup();
    const DELETE_URL = "path:/api/api-key/1";
    fetchMock.delete(DELETE_URL, 200);

    userEvent.click(
      within(
        await screen.findByRole("row", {
          name: /development api key/i,
        }),
      ).getByRole("img", { name: /trash/i }),
    );
    userEvent.click(
      await screen.findByRole("button", { name: "Delete API Key" }),
    );
    await waitFor(() => {
      expect(fetchMock.calls(DELETE_URL, { method: "DELETE" })).toHaveLength(1);
    });
    await waitFor(() => {
      expect(
        fetchMock.calls("path:/api/api-key", { method: "GET" }),
      ).toHaveLength(2);
    });
  });
});
