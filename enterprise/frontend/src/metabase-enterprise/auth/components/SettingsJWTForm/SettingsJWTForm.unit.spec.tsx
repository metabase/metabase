import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupGenerateRandomTokenEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { SettingsJWTForm } from "./SettingsJWTForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ id: 3, name: "foo" }),
  createMockGroup({ id: 4, name: "bar" }),
  createMockGroup({ id: 5, name: "flamingos" }),
];

const setup = async ({
  jwtEnabled,
  useTenants,
  configured,
}: {
  jwtEnabled?: boolean;
  useTenants?: boolean;
  configured?: boolean;
} = {}) => {
  setupSettingsEndpoints([
    { key: "use-tenants", value: useTenants ?? false },
    { key: "jwt-enabled", value: jwtEnabled ?? false },
    ...(configured
      ? ([
          { key: "jwt-identity-provider-uri", value: "http://example.com" },
          { key: "jwt-shared-secret", value: "590ab155f412d477b8ab9c8b0e7b" },
        ] as const)
      : []),
  ]);
  setupPropertiesEndpoints(
    createMockSettings({
      "use-tenants": useTenants,
      "jwt-enabled": jwtEnabled,
    }),
  );
  setupUpdateSettingsEndpoint();
  setupUpdateSettingEndpoint();
  setupGenerateRandomTokenEndpoint("1234abcd");

  fetchMock.get("path:/api/permissions/group", GROUPS);

  renderWithProviders(<SettingsJWTForm />, { withUndos: true });

  await screen.findByText("Server Settings");
};

describe("SettingsJWTForm", () => {
  const ATTRS = {
    "jwt-identity-provider-uri": "http://example.com",
    "jwt-shared-secret":
      "590ab155f412d477b8ab9c8b0e7b2e3ab4d4523e83770a724a2088edbde7f19a",
    "jwt-attribute-email": "john@example.com",
    "jwt-attribute-firstname": "John",
    "jwt-attribute-lastname": "Doe",
    "jwt-attribute-groups": "grouper",
    "jwt-enabled": true,
    "jwt-group-sync": true,
  };

  it("should submit the correct payload", async () => {
    await setup();

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Set up key/ }),
    );
    await userEvent.clear(await screen.findByLabelText(/New secret key/));
    await userEvent.type(
      await screen.findByLabelText(/New secret key/),
      ATTRS["jwt-shared-secret"],
    );
    await userEvent.click(await screen.findByRole("button", { name: /Done/ }));
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Email attribute/ }),
      ATTRS["jwt-attribute-email"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /First name attribute/ }),
      ATTRS["jwt-attribute-firstname"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Last name attribute/ }),
      ATTRS["jwt-attribute-lastname"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /Group assignment attribute/,
      }),
      ATTRS["jwt-attribute-groups"],
    );
    const groupSchema = await screen.findByTestId("jwt-group-schema");
    await userEvent.click(within(groupSchema).getByRole("switch")); // checkbox for "jwt-group-sync"

    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    // it's strange that there's no special JWT endpoint when other SSO methods have endpoints with fancy validation 🤷‍♀️
    expect(url).toMatch(/\/api\/setting$/);
    expect(body).toEqual(ATTRS);
  });

  it("should only update the mappings setting when adding a group mapping", async () => {
    await setup({ jwtEnabled: true, configured: true });

    await userEvent.click(
      await screen.findByRole("button", { name: /New mapping/ }),
    );
    await userEvent.type(
      await screen.findByLabelText("New group mapping name"),
      "cn=People",
    );
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toMatch(/\/api\/setting\/jwt-group-mappings$/);
    expect(body).toEqual({ value: { "cn=People": [] } });
  });

  it("shows a toast after saving", async () => {
    await setup({ jwtEnabled: true, configured: true });

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      "/extra",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Save changes" }),
    );

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("should not show tenant attribute unless tenanting is on", async () => {
    await setup();

    expect(
      screen.queryByText(/Tenant assignment attribute/),
    ).not.toBeInTheDocument();
  });

  it("should show tenant attribute when tenanting is on", async () => {
    await setup({ useTenants: true });

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );

    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /Tenant assignment attribute/,
      }),
      "Cat",
    );

    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;

    expect(url).toMatch(/\/api\/setting$/);
    expect(body).toHaveProperty("jwt-attribute-tenant", "Cat");
  });

  it("User provisioning should not appear if JWT has not been enabled", async () => {
    await setup({ jwtEnabled: false });

    const saveButton = await screen.findByRole("button", {
      name: "Save and enable",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.queryByText(/user provisioning/i)).not.toBeInTheDocument();
  });

  it("User provisioning should appear if JWT has been enabled", async () => {
    await setup({ jwtEnabled: true });

    const saveButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.getByText(/user provisioning/i)).toBeInTheDocument();
  });
});
