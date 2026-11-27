import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequestBodies,
  setupApiKeyEndpoints,
  setupCreateGroupEndpoint,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";

import { GroupsListingApp } from "./GroupsListingApp";

const INTERNAL_GROUP = createMockGroup({
  id: 3,
  name: "Engineering",
  magic_group_type: null,
  is_tenant_group: false,
});

const TENANT_GROUP = createMockGroup({
  id: 4,
  name: "Favorites",
  magic_group_type: null,
  is_tenant_group: true,
});

const SETTINGS_STATE = mockSettings({
  "token-features": createMockTokenFeatures({ tenants: true }),
  "use-tenants": true,
});

beforeAll(() => {
  setupEnterpriseOnlyPlugin("tenants");
});

const setup = ({ external }: { external: boolean }) => {
  const groups = [INTERNAL_GROUP, TENANT_GROUP];

  setupGroupsEndpoint(groups);
  setupCreateGroupEndpoint(groups);
  setupApiKeyEndpoints([]);

  renderWithProviders(<GroupsListingApp external={external} />, {
    storeInitialState: createMockState({
      settings: SETTINGS_STATE,
      currentUser: createMockUser({ is_superuser: true }),
    }),
  });
};

const createGroup = async (name: string) => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Create a group" }),
  );
  await userEvent.type(
    await screen.findByPlaceholderText(/something like/i),
    name,
  );
  await userEvent.click(screen.getByRole("button", { name: "Add" }));

  // The add row closes when the create request resolves.
  await waitFor(() =>
    expect(
      screen.queryByPlaceholderText(/something like/i),
    ).not.toBeInTheDocument(),
  );

  const [body] = await findRequestBodies({
    method: "POST",
    urlSuffix: "/api/permissions/group",
  });

  return body;
};

describe("GroupsListingApp", () => {
  describe("tenant groups page", () => {
    it("lists only tenant groups", async () => {
      setup({ external: true });

      expect(await screen.findByText(TENANT_GROUP.name)).toBeInTheDocument();
      expect(screen.queryByText(INTERNAL_GROUP.name)).not.toBeInTheDocument();
    });

    it("creates the group as a tenant group", async () => {
      setup({ external: true });

      const body = await createGroup("Marketing Team");

      expect(body).toEqual({
        name: "Marketing Team",
        is_tenant_group: true,
      });
    });

    it("shows the new group in the list without a reload", async () => {
      setup({ external: true });

      await createGroup("Marketing Team");

      expect(await screen.findByText("Marketing Team")).toBeInTheDocument();
    });
  });

  describe("internal groups page", () => {
    it("lists only internal groups", async () => {
      setup({ external: false });

      expect(await screen.findByText(INTERNAL_GROUP.name)).toBeInTheDocument();
      expect(screen.queryByText(TENANT_GROUP.name)).not.toBeInTheDocument();
    });

    it("creates the group as an internal group", async () => {
      setup({ external: false });

      const body = await createGroup("Marketing Team");

      expect(body).toEqual({
        name: "Marketing Team",
        is_tenant_group: false,
      });
    });
  });
});
