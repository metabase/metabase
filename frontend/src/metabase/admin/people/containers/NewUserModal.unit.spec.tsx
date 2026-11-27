import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequestBodies,
  setupGroupsEndpoint,
  setupTenantEntpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";

import { NewUserModal } from "./NewUserModal";

const NEW_USER_ID = 42;

const ALL_TENANT_USERS = createMockGroup({
  id: 10,
  name: "All tenant users",
  magic_group_type: "all-external-users",
  is_tenant_group: true,
});

const TENANT_GROUP = createMockGroup({
  id: 11,
  name: "Favorites",
  magic_group_type: null,
  is_tenant_group: true,
});

const TENANT = createMockTenant({ id: 5, name: "Gizmos", slug: "gizmo" });

beforeAll(() => {
  mockSettings({
    "token-features": createMockTokenFeatures({
      tenants: true,
      sandboxes: true,
    }),
  });
  setupEnterprisePlugins();
});

const setup = ({ emailConfigured }: { emailConfigured: boolean }) => {
  setupGroupsEndpoint([ALL_TENANT_USERS, TENANT_GROUP]);
  setupTenantEntpoints([TENANT]);
  fetchMock.post(
    "path:/api/user",
    createMockUser({ id: NEW_USER_ID, tenant_id: TENANT.id }),
  );

  const { router } = renderWithProviders(
    <>
      <Route
        path="/admin/people/tenants/people/new"
        element={<NewUserModal onClose={jest.fn()} external />}
      />
      <Route
        path="/admin/people/tenants/people/:userId/success"
        element={<>tenant user created</>}
      />
    </>,
    {
      withRouter: true,
      initialRoute: "/admin/people/tenants/people/new",
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            tenants: true,
            sandboxes: true,
          }),
          "email-configured?": emailConfigured,
        }),
      }),
    },
  );

  return { router };
};

const createTenantUser = async () => {
  await userEvent.type(await screen.findByLabelText("First name"), "Test");
  await userEvent.type(screen.getByLabelText("Last name"), "User");
  await userEvent.type(screen.getByLabelText(/Email/), "test.user@email.com");
  await userEvent.click(screen.getByRole("textbox", { name: "Tenant" }));
  await userEvent.click(await screen.findByText(TENANT.name));
  await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
  await userEvent.click(
    await screen.findByRole("option", { name: TENANT_GROUP.name }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Create" }));

  expect(await screen.findByText("tenant user created")).toBeInTheDocument();

  const [body] = await findRequestBodies({
    method: "POST",
    urlSuffix: "/api/user",
  });

  return body;
};

describe("NewUserModal", () => {
  it("is titled for tenant users", async () => {
    setup({ emailConfigured: true });

    expect(
      await screen.findByRole("dialog", { name: "Create tenant user" }),
    ).toBeInTheDocument();
  });

  it("leaves the password to the invite email when SMTP is configured", async () => {
    const { router } = setup({ emailConfigured: true });

    const body = await createTenantUser();

    expect(body).toMatchObject({
      email: "test.user@email.com",
      tenant_id: TENANT.id,
      user_group_memberships: [
        { id: ALL_TENANT_USERS.id, is_group_manager: false },
        { id: TENANT_GROUP.id, is_group_manager: false },
      ],
    });
    expect(body).not.toHaveProperty("password");
    expect(router?.location.pathname).toBe(
      `/admin/people/tenants/people/${NEW_USER_ID}/success`,
    );
  });

  it("generates a password when there is no SMTP to invite through", async () => {
    setup({ emailConfigured: false });

    const body = await createTenantUser();

    expect(body).toHaveProperty("password", expect.any(String));
  });
});
