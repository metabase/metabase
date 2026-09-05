import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupMfaAdminOverviewEndpoint,
  setupMfaStatusEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { dayjs } from "metabase/dayjs";
import { createMockState } from "metabase/redux/store/mocks";
import type { MfaAdminOverview, MfaEnforcement } from "metabase-types/api";
import {
  createMockMfaAdminOverview,
  createMockMfaStatus,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AdminAuthCard } from "./AdminAuthCard";

const DEADLINE_LABEL = "Enrollment deadline";

type SetupOpts = {
  enforcement?: MfaEnforcement;
  deadline?: string | null;
  hasFeature?: boolean;
  overview?: MfaAdminOverview;
  isAdmin?: boolean;
  isEnrolled?: boolean;
  isPasswordLoginEnabled?: boolean;
  isLdapEnabled?: boolean;
};

function setup({
  enforcement = "optional",
  deadline = null,
  hasFeature = true,
  overview = createMockMfaAdminOverview(),
  isAdmin = false,
  isEnrolled = true,
  isPasswordLoginEnabled = true,
  isLdapEnabled = false,
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "mfa-enforcement": enforcement,
    "mfa-requirement-deadline": deadline,
    "enable-password-login": isPasswordLoginEnabled,
    "ldap-enabled": isLdapEnabled,
    "token-features": createMockTokenFeatures({
      "multi-factor-auth": hasFeature,
    }),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({ key: "mfa-enforcement", value: enforcement }),
    createMockSettingDefinition({
      key: "mfa-requirement-deadline",
      value: deadline,
    }),
    createMockSettingDefinition({
      key: "enable-password-login",
      value: isPasswordLoginEnabled,
    }),
    createMockSettingDefinition({ key: "ldap-enabled", value: isLdapEnabled }),
  ]);
  setupUpdateSettingEndpoint();
  setupUpdateSettingsEndpoint();
  setupMfaAdminOverviewEndpoint(overview);
  setupMfaStatusEndpoint(createMockMfaStatus({ enrolled: isEnrolled }));

  renderWithProviders(<AdminAuthCard />, {
    withRouter: true,
    storeInitialState: createMockState({
      settings: mockSettings(settings),
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
}

/** The combined write, which goes to `/api/setting` with no key in the path. */
async function findBulkSettingUpdate() {
  const puts = await findRequests("PUT");
  const put = puts.find(({ url }: { url: string }) =>
    url.endsWith("/api/setting"),
  );

  expect(put).toBeDefined();
  return put;
}

const ALLOW_LABEL = "Allow two-factor authentication";
const ENFORCEMENT_LABEL = "Require two-factor authentication";
const NO_PASSWORD_LOGIN_HINT =
  "Enable password or LDAP authentication to enable two-factor authentication";

async function selectEnforcement(label: string) {
  const option = await screen.findByLabelText(label);

  await waitFor(() => expect(option).toBeEnabled());
  await userEvent.click(option);
}

async function confirmRequireNow() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Require now" }),
  );
}

describe("AdminAuthCard", () => {
  it("should show the enrollment counts when the setting is enabled", async () => {
    setup({
      overview: createMockMfaAdminOverview({
        enrolled_count: 1,
        unenrolled_count: 3,
      }),
    });

    expect(await screen.findByText("1 enrolled user")).toBeInTheDocument();
    expect(screen.getByText("3 users without 2FA")).toBeInTheDocument();
  });

  it("should link the counts to the drill-in lists for admins", async () => {
    setup({
      isAdmin: true,
      overview: createMockMfaAdminOverview({
        enrolled_count: 1,
        unenrolled_count: 3,
      }),
    });

    expect(
      await screen.findByRole("link", { name: "1 enrolled user" }),
    ).toHaveAttribute("href", "/admin/settings/authentication/2fa/enrolled");
    expect(
      screen.getByRole("link", { name: "3 users without 2FA" }),
    ).toHaveAttribute("href", "/admin/settings/authentication/2fa/unenrolled");
  });

  it("should not link the counts for a non-admin — the lists are superuser-only", async () => {
    setup({
      isAdmin: false,
      overview: createMockMfaAdminOverview({ enrolled_count: 1 }),
    });

    expect(await screen.findByText("1 enrolled user")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  describe("password authentication", () => {
    const NO_PASSWORD_LOGIN = {
      isPasswordLoginEnabled: false,
      isLdapEnabled: false,
    };

    it("should not let 2FA be turned on when password login and LDAP are both off", async () => {
      setup({ ...NO_PASSWORD_LOGIN, enforcement: "off" });

      const enableSwitch = await screen.findByLabelText(ALLOW_LABEL);

      expect(enableSwitch).toBeDisabled();

      await userEvent.hover(enableSwitch);

      expect(
        await screen.findByRole("tooltip", { name: NO_PASSWORD_LOGIN_HINT }),
      ).toBeInTheDocument();
    });

    it("should still let an admin turn 2FA off once it is on", async () => {
      setup({ ...NO_PASSWORD_LOGIN, enforcement: "optional" });

      const enableSwitch = await screen.findByLabelText(ALLOW_LABEL);
      expect(await screen.findByLabelText("Don't require")).toBeDisabled();
      expect(screen.getByLabelText("Require now")).toBeDisabled();
      expect(screen.getByLabelText("Require by a certain date")).toBeDisabled();

      expect(enableSwitch).toBeEnabled();

      await userEvent.click(enableSwitch);

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("off");
      });
    });

    it("should keep the switch live when password login is off but LDAP is on", async () => {
      setup({ isPasswordLoginEnabled: false, isLdapEnabled: true });

      expect(await screen.findByLabelText(ALLOW_LABEL)).toBeEnabled();
    });

    it("should keep the switch live when password login is on", async () => {
      setup({ isPasswordLoginEnabled: true, isLdapEnabled: false });

      expect(await screen.findByLabelText(ALLOW_LABEL)).toBeEnabled();
    });
  });

  it("should warn when the encryption key is not set", async () => {
    setup({
      overview: createMockMfaAdminOverview({ encryption_key_set: false }),
    });

    expect(
      await screen.findByText(/MB_ENCRYPTION_SECRET_KEY/),
    ).toBeInTheDocument();
  });

  describe("allowing two-factor authentication", () => {
    it("should turn it on as optional", async () => {
      setup({ enforcement: "off" });

      const enableSwitch = await screen.findByLabelText(ALLOW_LABEL);

      expect(enableSwitch).toBeInTheDocument();
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

      await userEvent.click(enableSwitch);

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("optional");
        expect(put?.body["mfa-requirement-deadline"]).toBeNull();
      });
    });

    it("should turn it off and clear the deadline", async () => {
      const chosen = dayjs().add(30, "day").startOf("day").toISOString();

      setup({ enforcement: "required", deadline: chosen });

      expect(
        await screen.findByRole("radiogroup", { name: ENFORCEMENT_LABEL }),
      ).toBeInTheDocument();

      await userEvent.click(await screen.findByLabelText(ALLOW_LABEL));

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("off");
        expect(put?.body["mfa-requirement-deadline"]).toBeNull();
      });
    });
  });

  describe("default grace period", () => {
    it("should seed a two-week deadline when enforcement becomes required", async () => {
      setup({ enforcement: "optional", deadline: null });

      await selectEnforcement("Require by a certain date");

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("required");
        expect(
          dayjs(put?.body["mfa-requirement-deadline"]).format("YYYY-MM-DD"),
        ).toBe(dayjs().add(14, "day").format("YYYY-MM-DD"));
      });
    });

    it("should clear a stored deadline when enforcement is immediate", async () => {
      const chosen = dayjs().add(90, "day").startOf("day").toISOString();

      setup({ enforcement: "required", deadline: chosen });

      await selectEnforcement("Require now");
      await confirmRequireNow();

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("required");
        expect(put?.body["mfa-requirement-deadline"]).toBeNull();
      });
    });

    // An optional instance must not carry a deadline, or it would take effect the moment
    // enforcement came back on.
    it("should clear the deadline when enforcement goes back to optional", async () => {
      const chosen = dayjs().add(30, "day").startOf("day").toISOString();

      setup({ enforcement: "required", deadline: chosen });

      await selectEnforcement("Don't require");

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("optional");
        expect(put?.body["mfa-requirement-deadline"]).toBeNull();
      });
    });
  });

  describe("requiring immediately", () => {
    const CONFIRMATION_MODAL_TEXT = /This will require everyone/;
    it("should warn that signed-in users will be signed out", async () => {
      setup({ enforcement: "optional" });

      await selectEnforcement("Require now");

      expect(
        await screen.findByText(CONFIRMATION_MODAL_TEXT),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /log back in now if they haven't logged in with 2FA before/,
        ),
      ).toBeInTheDocument();

      expect(await findRequests("PUT")).toHaveLength(0);

      await confirmRequireNow();

      expect(await findRequests("PUT")).toHaveLength(1);
    });

    it("should leave enforcement alone when the warning is dismissed", async () => {
      setup({ enforcement: "optional" });

      await selectEnforcement("Require now");
      expect(
        await screen.findByText(CONFIRMATION_MODAL_TEXT),
      ).toBeInTheDocument();

      await userEvent.click(
        await screen.findByRole("button", { name: "Cancel" }),
      );

      await waitFor(() => {
        expect(
          screen.queryByText(CONFIRMATION_MODAL_TEXT),
        ).not.toBeInTheDocument();
      });
      expect(await findRequests("PUT")).toHaveLength(0);
      expect(screen.getByLabelText("Don't require")).toBeChecked();
    });

    it("should not warn when a deadline is set instead", async () => {
      setup({ enforcement: "optional" });

      await selectEnforcement("Require by a certain date");

      await waitFor(async () => {
        await findBulkSettingUpdate();
      });
      expect(
        screen.queryByText(CONFIRMATION_MODAL_TEXT),
      ).not.toBeInTheDocument();
    });
  });

  describe("enrollment deadline", () => {
    it("should be hidden unless enforcement is required", () => {
      setup({ enforcement: "optional" });

      expect(screen.queryByLabelText(DEADLINE_LABEL)).not.toBeInTheDocument();
    });

    it("should show the stored deadline as a local date", () => {
      const stored = dayjs("2099-01-01").startOf("day").toISOString();

      setup({ enforcement: "required", deadline: stored });

      expect(screen.getByLabelText(DEADLINE_LABEL)).toHaveValue(
        "January 1, 2099",
      );
    });
  });

  describe("admin has not enrolled", () => {
    it("should only allow enforcement to stay optional", async () => {
      setup({ enforcement: "optional", isEnrolled: false });

      await screen.findByRole("link", {
        name: "Set up two-factor authentication",
      });

      expect(screen.getByLabelText("Don't require")).toBeEnabled();
      expect(screen.getByLabelText("Require now")).toBeDisabled();
      expect(screen.getByLabelText("Require by a certain date")).toBeDisabled();

      expect(
        await screen.findByRole("link", {
          name: "Set up two-factor authentication",
        }),
      ).toHaveAttribute("href", "/account/authentication");
    });

    it("should allow requiring once they have enrolled", async () => {
      setup({ enforcement: "optional", isEnrolled: true });

      await waitFor(() => {
        expect(screen.getByLabelText("Require now")).toBeEnabled();
      });
      expect(screen.getByLabelText("Require by a certain date")).toBeEnabled();
      expect(
        screen.queryByRole("link", {
          name: "Set up two-factor authentication",
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("lapsed license", () => {
    it("should let an admin turn 2FA off but not change enforcement", async () => {
      setup({ hasFeature: false, enforcement: "required" });

      expect(
        await screen.findByLabelText("Allow two-factor authentication"),
      ).toBeEnabled();

      expect(screen.getByLabelText("Don't require")).toBeDisabled();
      expect(screen.getByLabelText("Require now")).toBeDisabled();
      expect(screen.getByLabelText("Require by a certain date")).toBeDisabled();
    });
  });
});
