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

async function findSettingUpdate(key: string) {
  const puts = await findRequests("PUT");
  const put = puts.find(({ url }: { url: string }) =>
    url.includes(`/api/setting/${key}`),
  );

  expect(put).toBeDefined();
  return put;
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

async function selectEnforcement(label: string) {
  await userEvent.click(screen.getByLabelText("Enforcement"));
  await userEvent.click(await screen.findByRole("option", { name: label }));
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
        expect(screen.queryByLabelText("Enforcement")).not.toBeInTheDocument();
      });
      expect(
        screen.queryByText("Two-factor authentication"),
      ).not.toBeInTheDocument();
    });

    it("should keep the card when password login is off but LDAP is on", async () => {
      setup({ isPasswordLoginEnabled: false, isLdapEnabled: true });

      expect(await screen.findByLabelText("Enforcement")).toBeInTheDocument();
    });

    it("should keep the card when password login is on", async () => {
      setup({ isPasswordLoginEnabled: true, isLdapEnabled: false });

      expect(await screen.findByLabelText("Enforcement")).toBeInTheDocument();
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

  describe("default grace period", () => {
    it("should seed a two-week deadline when enforcement becomes required", async () => {
      setup({ enforcement: "optional", deadline: null });

      await selectEnforcement("Required");

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(put?.body["mfa-enforcement"]).toBe("required");
        expect(
          dayjs(put?.body["mfa-requirement-deadline"]).format("YYYY-MM-DD"),
        ).toBe(dayjs().add(14, "day").format("YYYY-MM-DD"));
      });
    });

    it("should write the enforcement and the deadline in a single request", async () => {
      setup({ enforcement: "optional", deadline: null });

      await selectEnforcement("Required");

      await waitFor(async () => {
        await findBulkSettingUpdate();
      });

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    it("should not overwrite a deadline the admin already set in the future", async () => {
      const chosen = dayjs().add(90, "day").startOf("day").toISOString();

      setup({ enforcement: "optional", deadline: chosen });

      await selectEnforcement("Required");

      await waitFor(async () => {
        const put = await findSettingUpdate("mfa-enforcement");
        expect(put?.body).toEqual({ value: "required" });
      });

      const puts = await findRequests("PUT");
      expect(
        puts.filter(({ url }: { url: string }) => url.endsWith("/api/setting")),
      ).toHaveLength(0);
    });

    it("should replace a deadline that has already passed", async () => {
      const stale = dayjs().subtract(30, "day").startOf("day").toISOString();

      setup({ enforcement: "optional", deadline: stale });

      await selectEnforcement("Required");

      await waitFor(async () => {
        const put = await findBulkSettingUpdate();
        expect(
          dayjs(put?.body["mfa-requirement-deadline"]).format("YYYY-MM-DD"),
        ).toBe(dayjs().add(14, "day").format("YYYY-MM-DD"));
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

    // The backend coerces this value with `u.date/parse` and compares it to `now` on every
    // authenticated request — a bare "YYYY-MM-DD" parses to a LocalDate there and throws.
    it("should save a full instant, not a bare date", async () => {
      setup({ enforcement: "required" });

      await userEvent.type(
        screen.getByLabelText(DEADLINE_LABEL),
        "January 1, 2099",
      );
      await userEvent.tab();

      await waitFor(async () => {
        const put = await findSettingUpdate("mfa-requirement-deadline");
        expect(put?.body.value).toContain("T");
        expect(dayjs(put?.body.value).format("YYYY-MM-DD")).toBe("2099-01-01");
      });
    });

    it("should clear the deadline back to null", async () => {
      const stored = dayjs("2099-01-01").startOf("day").toISOString();

      setup({ enforcement: "required", deadline: stored });

      await userEvent.clear(screen.getByLabelText(DEADLINE_LABEL));
      await userEvent.tab();

      await waitFor(async () => {
        const put = await findSettingUpdate("mfa-requirement-deadline");
        expect(put?.body).toEqual({ value: null });
      });
    });

    // Clearing is how an admin makes enforcement take effect immediately, so the button
    // needs a name rather than being a bare icon.
    it("should offer a labelled clear button", async () => {
      const stored = dayjs("2099-01-01").startOf("day").toISOString();

      setup({ enforcement: "required", deadline: stored });

      await userEvent.click(
        screen.getByRole("button", { name: "Clear enrollment deadline" }),
      );

      await waitFor(async () => {
        const put = await findSettingUpdate("mfa-requirement-deadline");
        expect(put?.body).toEqual({ value: null });
      });
    });
  });
});
