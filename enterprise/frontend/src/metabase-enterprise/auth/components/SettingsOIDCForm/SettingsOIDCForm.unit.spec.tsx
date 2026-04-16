import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { CustomOidcConfig } from "metabase-enterprise/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { SettingsOIDCForm } from "./SettingsOIDCForm";

const GROUPS = [
  createMockGroup({
    id: 1,
    name: "All Users",
    magic_group_type: "all-internal-users",
  }),
  createMockGroup({
    id: 2,
    name: "Administrators",
    magic_group_type: "admin",
  }),
  createMockGroup({ id: 3, name: "Engineering" }),
  createMockGroup({ id: 4, name: "Marketing" }),
];

const EXISTING_PROVIDER: CustomOidcConfig = {
  key: "okta",
  "login-prompt": "Sign in with Okta",
  "issuer-uri": "https://okta.example.com",
  "client-id": "client-123",
  scopes: ["openid", "email", "profile"],
  enabled: true,
  "attribute-map": {
    email: "email",
    first_name: "given_name",
    last_name: "family_name",
  },
};

function setupEndpoints({
  providers = [],
}: {
  providers?: CustomOidcConfig[];
} = {}) {
  const settings = createMockSettings();
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);

  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.get("path:/api/ee/sso/oidc", providers);
  fetchMock.post("path:/api/ee/sso/oidc", 200);
  fetchMock.put("path:/api/ee/sso/oidc/okta", 200);
  fetchMock.post("path:/api/ee/sso/oidc/check", {
    ok: true,
    discovery: { step: "discovery", success: true },
    credentials: { step: "credentials", success: true, verified: true },
  });
}

async function getOidcPutCalls() {
  const puts = await findRequests("PUT");
  return puts.filter(({ url }) => url.includes("/api/ee/sso/oidc/okta"));
}

const setup = async (options?: { providers?: CustomOidcConfig[] }) => {
  setupEndpoints(options);

  renderWithProviders(<SettingsOIDCForm />);

  await screen.findByText("OpenID Connect");
};

describe("SettingsOIDCForm - Group Sync", () => {
  it("does not show group sync section for new providers", async () => {
    await setup({ providers: [] });

    expect(
      screen.queryByText("Synchronize group membership with your SSO"),
    ).not.toBeInTheDocument();
  });

  it("shows group sync section for existing providers", async () => {
    await setup({ providers: [EXISTING_PROVIDER] });

    expect(
      screen.getByText("Synchronize group membership with your SSO"),
    ).toBeInTheDocument();
  });

  it("renders group sync toggle", async () => {
    await setup({ providers: [EXISTING_PROVIDER] });

    expect(screen.getByTestId("group-sync-switch")).toBeInTheDocument();
  });

  it("renders group attribute text input", async () => {
    await setup({ providers: [EXISTING_PROVIDER] });

    expect(screen.getByLabelText("Group attribute name")).toBeInTheDocument();
  });

  it("populates group sync fields from existing provider config", async () => {
    await setup({
      providers: [
        {
          ...EXISTING_PROVIDER,
          "group-sync": {
            enabled: true,
            "group-attribute": "groups",
            "group-mappings": { engineers: [3] },
          },
        },
      ],
    });

    const groupAttrInput = screen.getByLabelText("Group attribute name");
    expect(groupAttrInput).toHaveValue("groups");
  });

  it("shows existing group mappings from provider config", async () => {
    await setup({
      providers: [
        {
          ...EXISTING_PROVIDER,
          "group-sync": {
            enabled: true,
            "group-attribute": "groups",
            "group-mappings": { admins: [2], devs: [3] },
          },
        },
      ],
    });

    expect(screen.getByText("admins")).toBeInTheDocument();
    expect(screen.getByText("devs")).toBeInTheDocument();
  });

  it("renders New mapping button", async () => {
    await setup({
      providers: [
        {
          ...EXISTING_PROVIDER,
          "group-sync": { enabled: true, "group-mappings": {} },
        },
      ],
    });

    expect(
      screen.getByRole("button", { name: "New mapping" }),
    ).toBeInTheDocument();
  });

  it("includes group sync in form submission", async () => {
    await setup({ providers: [EXISTING_PROVIDER] });

    // Change group attribute to make the form dirty
    const groupAttrInput = screen.getByLabelText("Group attribute name");
    await userEvent.clear(groupAttrInput);
    await userEvent.type(groupAttrInput, "roles");

    const submitButton = screen.getByRole("button", {
      name: "Save changes",
    });
    await userEvent.click(submitButton);

    await waitFor(async () => {
      const puts = await getOidcPutCalls();
      expect(puts.length).toBeGreaterThan(0);
    });

    const puts = await getOidcPutCalls();
    const lastPut = puts[puts.length - 1];
    expect(lastPut.body["group-sync"]).toEqual(
      expect.objectContaining({
        enabled: false,
        "group-mappings": {},
      }),
    );
    expect(lastPut.body["group-sync"]["group-attribute"]).toBe("roles");
  });

  it("does not overwrite group mappings added via the widget on form save", async () => {
    // Scenario: user adds a mapping via GroupMappingsWidgetView (which saves
    // immediately via PUT), then submits the form. The form should include the
    // freshly-saved mappings, not the stale prop value from initial render.
    await setup({
      providers: [
        {
          ...EXISTING_PROVIDER,
          "group-sync": {
            enabled: true,
            "group-attribute": "groups",
            "group-mappings": {},
          },
        },
      ],
    });

    // Make the form dirty first so we can detect the form-level submit
    const groupAttrInput = screen.getByLabelText("Group attribute name");
    await userEvent.clear(groupAttrInput);
    await userEvent.type(groupAttrInput, "roles");

    // Add a mapping via the widget: click "New mapping", type name, click Add
    const newMappingButton = screen.getByRole("button", {
      name: "New mapping",
    });
    await userEvent.click(newMappingButton);

    const input = screen.getByPlaceholderText("Group name");
    await userEvent.type(input, "Group 1");
    const addButton = screen.getByRole("button", { name: "Add" });
    await userEvent.click(addButton);

    // The "Add" button (type="submit") also submits the Formik form, so
    // multiple PUTs fire. The form submit that includes full provider data
    // (attribute-map, scopes, etc.) is the one from the Formik handler.
    // Due to event ordering, the first form PUT may have stale mappings,
    // but the second one (after the ref is updated) should have the correct
    // mappings. We verify the LAST form-level PUT has the right data.
    await waitFor(async () => {
      const puts = await getOidcPutCalls();
      const formPuts = puts.filter(
        (p: { body: Record<string, unknown> }) => p.body["attribute-map"],
      );
      expect(formPuts.length).toBeGreaterThanOrEqual(1);
    });

    const puts = await getOidcPutCalls();
    const formPuts = puts.filter(
      (p: { body: Record<string, unknown> }) => p.body["attribute-map"],
    );
    const lastFormPut = formPuts[formPuts.length - 1];
    // The last form submission should include the mapping added via the widget
    expect(lastFormPut.body["group-sync"]["group-mappings"]).toEqual({
      "Group 1": [],
    });
    expect(lastFormPut.body["group-sync"]["group-attribute"]).toBe("roles");
  });

  it("preserves existing group mappings on form submission", async () => {
    await setup({
      providers: [
        {
          ...EXISTING_PROVIDER,
          "group-sync": {
            enabled: true,
            "group-attribute": "groups",
            "group-mappings": { admins: [2], devs: [3] },
          },
        },
      ],
    });

    // Change the group attribute to make the form dirty
    const groupAttrInput = screen.getByLabelText("Group attribute name");
    await userEvent.clear(groupAttrInput);
    await userEvent.type(groupAttrInput, "roles");

    const submitButton = screen.getByRole("button", {
      name: "Save changes",
    });
    await userEvent.click(submitButton);

    await waitFor(async () => {
      const puts = await getOidcPutCalls();
      expect(puts.length).toBeGreaterThan(0);
    });

    const puts = await getOidcPutCalls();
    const lastPut = puts[puts.length - 1];
    expect(lastPut.body["group-sync"]).toEqual({
      enabled: true,
      "group-attribute": "roles",
      "group-mappings": { admins: [2], devs: [3] },
    });
  });
});
