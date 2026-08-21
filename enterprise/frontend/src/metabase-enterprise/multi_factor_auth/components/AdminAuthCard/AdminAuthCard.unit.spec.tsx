import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";

import {
  findRequests,
  setupMfaAdminOverviewEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { MfaAdminOverview, MfaEnforcement } from "metabase-types/api";
import {
  createMockMfaAdminOverview,
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
  isPasswordLoginEnabled?: boolean;
  isLdapEnabled?: boolean;
};

function setup({
  enforcement = "optional",
  deadline = null,
  hasFeature = true,
  overview = createMockMfaAdminOverview(),
  isAdmin = false,
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

async function selectEnforcement(label: string) {
  await userEvent.click(await screen.findByLabelText(label));
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
    it("should hide the card when password login and LDAP are both off", async () => {
      setup({ isPasswordLoginEnabled: false, isLdapEnabled: false });

      await waitFor(() => {
        expect(screen.queryByLabelText(ALLOW_LABEL)).not.toBeInTheDocument();
      });
      expect(
        screen.queryByText("Two-factor authentication"),
      ).not.toBeInTheDocument();
    });

    it("should keep the card when password login is off but LDAP is on", async () => {
      setup({ isPasswordLoginEnabled: false, isLdapEnabled: true });

      expect(await screen.findByLabelText(ALLOW_LABEL)).toBeInTheDocument();
    });

    it("should keep the card when password login is on", async () => {
      setup({ isPasswordLoginEnabled: true, isLdapEnabled: false });

      expect(await screen.findByLabelText(ALLOW_LABEL)).toBeInTheDocument();
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

      await userEvent.click(await screen.findByLabelText(ALLOW_LABEL));

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("off");
        expect(put?.body["mfa-requirement-deadline"]).toBeNull();
      });

      expect(
        await screen.findByRole("radiogroup", { name: ENFORCEMENT_LABEL }),
      ).toBeInTheDocument();
    });

    it("should name the enforcement group for screen readers", async () => {
      setup({ enforcement: "optional" });

      expect(
        await screen.findByRole("radiogroup", { name: ENFORCEMENT_LABEL }),
      ).toBeInTheDocument();
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
