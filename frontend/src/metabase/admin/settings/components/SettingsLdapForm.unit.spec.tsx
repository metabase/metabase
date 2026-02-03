import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import type { LdapSettings } from "./SettingsLdapForm";
import { SettingsLdapForm } from "./SettingsLdapForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ id: 3, name: "foo" }),
  createMockGroup({ id: 4, name: "bar" }),
  createMockGroup({ id: 5, name: "flamingos" }),
];

const setup = async (settingValues?: Partial<LdapSettings>) => {
  const settings = createMockSettings(settingValues);
  delete settings["ldap-group-membership-filter"]; // not present in OSS
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);

  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.put("path:/api/ldap/settings", { status: 204 });

  renderWithProviders(<SettingsLdapForm />);

  await screen.findByText("Server settings");

  // Wait for groups to load and component to fully render to avoid act() warnings
  await screen.findByText("Synchronize Group Memberships");
  await screen.findByText("New mapping");
};

describe("SettingsLdapForm", () => {
  const ATTRS = {
    "ldap-host": "example.com",
    "ldap-port": 123,
    "ldap-security": "ssl",
    "ldap-user-base": "user-base",
    "ldap-user-filter": "(filter1)",
    "ldap-bind-dn": "username",
    "ldap-password": "password",
    "ldap-attribute-email": "john@example.com",
    "ldap-attribute-firstname": "John",
    "ldap-attribute-lastname": "Doe",
    "ldap-enabled": true,
    "ldap-group-sync": true,
    "ldap-group-base": "group-base",
  };

  it("should submit the correct payload", async () => {
    await setup();

    await userEvent.type(
      await screen.findByLabelText(/LDAP host/),
      ATTRS["ldap-host"],
    );

    const portInput = await screen.findByLabelText(/LDAP port/);
    await userEvent.clear(portInput);
    await userEvent.type(portInput, ATTRS["ldap-port"].toString());
    await userEvent.click(screen.getByRole("radio", { name: /SSL/ }));
    await userEvent.type(
      await screen.findByLabelText(/Username or DN/),
      ATTRS["ldap-bind-dn"],
    );
    await userEvent.type(
      screen.getByLabelText(/Password/),
      ATTRS["ldap-password"],
    );
    await userEvent.type(
      await screen.findByLabelText(/User search base/),
      ATTRS["ldap-user-base"],
    );
    await userEvent.type(
      await screen.findByLabelText(/User filter/),
      ATTRS["ldap-user-filter"],
    );
    await userEvent.type(
      await screen.findByLabelText(/Email attribute/),
      ATTRS["ldap-attribute-email"],
    );
    await userEvent.type(
      await screen.findByLabelText(/First name attribute/),
      ATTRS["ldap-attribute-firstname"],
    );
    await userEvent.type(
      await screen.findByLabelText(/Last name attribute/),
      ATTRS["ldap-attribute-lastname"],
    );
    await userEvent.click(screen.getByTestId("group-sync-switch")); // checkbox for "ldap-group-sync"
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Group search base/ }),
      ATTRS["ldap-group-base"],
    );

    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const [{ url, body }] = await findRequests("PUT");

    expect(url).toMatch(/api\/ldap\/settings/);
    expect(body).toEqual(ATTRS);
  });

  it("should hide group membership fields on OSS", async () => {
    await setup({ "ldap-enabled": true });
    expect(
      screen.queryByRole("textbox", { name: /Group membership filter/ }),
    ).not.toBeInTheDocument();
  });

  it("can remove a nullable field", async () => {
    await setup(ATTRS as Partial<LdapSettings>);

    await userEvent.clear(await screen.findByLabelText(/First name attribute/));
    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const [{ body }] = await findRequests("PUT");

    // if the field is omitted, this will be undefined instead of null
    expect(body["ldap-attribute-firstname"]).toBe(null);
    expect(body["ldap-attribute-lastname"]).toBe(
      ATTRS["ldap-attribute-lastname"],
    );
  });
});
