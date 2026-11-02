import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockAdminState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { UserSuccessModal } from "./UserSuccessModal";

const USER_ID = 42;

const SETTINGS_STATE = mockSettings({
  "token-features": createMockTokenFeatures({ tenants: true }),
  "use-tenants": true,
  "email-configured?": true,
});

beforeAll(() => {
  setupEnterprisePlugins();
});

interface SetupOpts {
  tenantId?: User["tenant_id"];
  temporaryPassword?: string;
}

const setup = ({ tenantId = null, temporaryPassword }: SetupOpts = {}) => {
  const user: User = createMockUser({
    id: USER_ID,
    first_name: "Test",
    last_name: "User",
    common_name: "Test User",
    email: "test.user@email.com",
    tenant_id: tenantId,
  });

  setupUserEndpoints(user);

  const { router } = renderWithProviders(
    <>
      <Route
        path="/admin/people/tenants/people/:userId/success"
        element={<UserSuccessModal params={{ userId: String(USER_ID) }} />}
      />
      <Route
        path="/admin/people/:userId/success"
        element={<UserSuccessModal params={{ userId: String(USER_ID) }} />}
      />
      <Route path="/admin/people/tenants/people" element={<>tenant users</>} />
      <Route path="/admin/people" element={<>internal users</>} />
    </>,
    {
      withRouter: true,
      initialRoute: tenantId
        ? `/admin/people/tenants/people/${USER_ID}/success`
        : `/admin/people/${USER_ID}/success`,
      storeInitialState: createMockState({
        settings: SETTINGS_STATE,
        admin: createMockAdminState({
          people: {
            temporaryPasswords: temporaryPassword
              ? { [USER_ID]: temporaryPassword }
              : {},
          },
        }),
      }),
    },
  );

  return { router };
};

describe("UserSuccessModal", () => {
  it("sends a tenant user with no temporary password straight back to the list", async () => {
    const { router } = setup({ tenantId: 7 });

    expect(await screen.findByText("tenant users")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/admin/people/tenants/people");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the generated password for a tenant user when email is not configured", async () => {
    const { router } = setup({ tenantId: 7, temporaryPassword: "s3cret-pw" });

    const dialog = await screen.findByRole("dialog", {
      name: "Test User has been added",
    });
    expect(dialog).toHaveTextContent(
      "We couldn’t send them an email invitation",
    );
    expect(dialog).not.toHaveTextContent("We’ve sent an invite to");
    expect(router?.location.pathname).toBe(
      `/admin/people/tenants/people/${USER_ID}/success`,
    );
  });

  it("still confirms the emailed invite for an internal user", async () => {
    setup();

    const dialog = await screen.findByRole("dialog", {
      name: "Test User has been added",
    });
    expect(dialog).toHaveTextContent("We’ve sent an invite to");
  });
});
