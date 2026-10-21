import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCreateUserEndpoint,
  setupGroupsEndpoint,
  setupTenantEntpoints,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route } from "metabase/router";
import {
  createMockGroup,
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { NewUserModal } from "./NewUserModal";
import { UserSuccessModal } from "./UserSuccessModal";

const TENANT = createMockTenant({ id: 7, name: "Gizmos", slug: "gizmo" });

const NEW_TENANT_USER = createMockUser({
  id: 42,
  first_name: "Testy",
  last_name: "McTestface",
  common_name: "Testy McTestface",
  email: "testy@metabase.test",
  tenant_id: TENANT.id,
});

const TENANT_USERS_PATH = "/admin/people/tenants/people";

interface SetupOpts {
  emailConfigured: boolean;
}

const setup = ({ emailConfigured }: SetupOpts) => {
  setupGroupsEndpoint([
    createMockGroup({
      id: 3,
      name: "All tenant users",
      magic_group_type: "all-external-users",
    }),
  ]);
  setupTenantEntpoints([TENANT]);
  setupCreateUserEndpoint(NEW_TENANT_USER);
  setupUserEndpoints(NEW_TENANT_USER);
  // The plugin reads token features when it initializes.
  const storeInitialState = createMockState({
    settings: mockSettings({
      "email-configured?": emailConfigured,
      "token-features": createMockTokenFeatures({ tenants: true }),
    }),
  });
  setupEnterpriseOnlyPlugin("tenants");

  const { router } = renderWithProviders(
    <>
      <Route path={TENANT_USERS_PATH}>
        <Route index element={<div>Tenant users list</div>} />
        {modalRoute(
          "new",
          (props) => (
            <NewUserModal {...props} external />
          ),
          { noWrap: true },
        )}
      </Route>
      <Route path={`${TENANT_USERS_PATH}/:userId`}>
        {modalRoute("success", UserSuccessModal, { noWrap: true })}
      </Route>
    </>,
    {
      withRouter: true,
      initialRoute: `${TENANT_USERS_PATH}/new`,
      storeInitialState,
    },
  );

  return { pathname: () => router?.location.pathname };
};

const createTenantUser = async () => {
  await userEvent.type(screen.getByLabelText("First name"), "Testy");
  await userEvent.type(screen.getByLabelText("Last name"), "McTestface");
  await userEvent.type(screen.getByLabelText(/Email/), NEW_TENANT_USER.email);
  await userEvent.click(await screen.findByRole("textbox", { name: "Tenant" }));
  await userEvent.click(await screen.findByRole("option", { name: "Gizmos" }));
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
};

const getCreateUserBody = async (): Promise<unknown> => {
  const call = fetchMock.callHistory.lastCall("path:/api/user", {
    method: "POST",
  });
  return call?.request?.json();
};

describe("NewUserModal for tenant users", () => {
  it("should not show the success modal after creating a tenant user when email is configured", async () => {
    const { pathname } = setup({ emailConfigured: true });

    await createTenantUser();

    expect(await screen.findByText("Tenant users list")).toBeInTheDocument();
    expect(pathname()).toBe(TENANT_USERS_PATH);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const body = await getCreateUserBody();
    expect(body).toMatchObject({
      email: NEW_TENANT_USER.email,
      tenant_id: TENANT.id,
    });
    expect(body).not.toHaveProperty("password");
  });

  it("should show the generated password after creating a tenant user when email is not configured", async () => {
    const { pathname } = setup({ emailConfigured: false });

    await createTenantUser();

    expect(
      await screen.findByRole("dialog", {
        name: "Testy McTestface has been added",
      }),
    ).toHaveTextContent("We couldn’t send them an email invitation");
    expect(pathname()).toBe(`${TENANT_USERS_PATH}/42/success`);
  });
});
