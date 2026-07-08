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
  fetchMock.get("path:/api/ee/sso/oidc", providers, {
    name: "oidc-providers",
  });
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

  it("shows the group sync UI for existing providers", async () => {
    await setup({ providers: [EXISTING_PROVIDER] });

    expect(
      screen.getByText("Synchronize group membership with your SSO"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("group-sync-switch")).toBeInTheDocument();
    expect(screen.getByLabelText("Group attribute name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New mapping" }),
    ).toBeInTheDocument();
  });

  it("populates group sync fields and mappings from existing provider config", async () => {
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

    expect(screen.getByLabelText("Group attribute name")).toHaveValue("groups");
    expect(screen.getByText("admins")).toBeInTheDocument();
    expect(screen.getByText("devs")).toBeInTheDocument();
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
    const provider = {
      ...EXISTING_PROVIDER,
      "group-sync": {
        enabled: true,
        "group-attribute": "groups",
        "group-mappings": {},
      },
    };
    await setup({ providers: [provider] });

    // Make the form dirty so it can be saved
    const groupAttrInput = screen.getByLabelText("Group attribute name");
    await userEvent.clear(groupAttrInput);
    await userEvent.type(groupAttrInput, "roles");

    // After the widget saves, the providers refetch returns the new mapping
    fetchMock.removeRoute("oidc-providers");
    fetchMock.get(
      "path:/api/ee/sso/oidc",
      [
        {
          ...provider,
          "group-sync": {
            ...provider["group-sync"],
            "group-mappings": { "Group 1": [] },
          },
        },
      ],
      { name: "oidc-providers" },
    );

    // Add a mapping via the widget: click "New mapping", type name, click Add
    await userEvent.click(screen.getByRole("button", { name: "New mapping" }));
    await userEvent.type(screen.getByPlaceholderText("Group name"), "Group 1");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    // The widget saves the mapping immediately, without submitting the form
    await waitFor(async () => {
      const puts = await getOidcPutCalls();
      expect(puts).toHaveLength(1);
    });

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(async () => {
      const puts = await getOidcPutCalls();
      expect(puts).toHaveLength(2);
    });

    const puts = await getOidcPutCalls();
    const formPut = puts[puts.length - 1];
    // The form submission should include the mapping added via the widget
    expect(formPut.body["attribute-map"]).toBeDefined();
    expect(formPut.body["group-sync"]["group-mappings"]).toEqual({
      "Group 1": [],
    });
    expect(formPut.body["group-sync"]["group-attribute"]).toBe("roles");
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
