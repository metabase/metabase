import type { ComponentType } from "react";

import { screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";

import type { SetupOpts } from "./constants.spec";

type Setup = (opts?: SetupOpts) => Promise<void>;

export function addAlertsButtonTests(
  setup: Setup,
  { customComponent: AlertsButton }: { customComponent: ComponentType },
) {
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- test description
  describe("alerts button with different Metabase version configurations", () => {
    beforeEach(() => {
      reinitialize();
    });

    // Fix this in EMB-1184, when we can test SDK with API keys
    describe.skip("OSS (Open Source Software)", () => {
      it("should not show the alert button in OSS regardless of settings", async () => {
        // Don't setup enterprise plugin for OSS
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          tokenFeatures: {}, // No embedding_sdk feature
        });

        expect(
          within(screen.getByRole("gridcell")).getByText("Test Row"),
        ).toBeVisible();
        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });
    });

    // Fix this in EMB-1184, when we can test SDK with API keys
    describe.skip("EE (Enterprise Edition) without embedding_sdk token feature", () => {
      it("should not show the alert button when plugin is enabled but token feature is missing", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          enterprisePlugins: ["sdk_notifications"],
          tokenFeatures: {}, // No embedding_sdk feature
        });

        expect(
          within(screen.getByRole("gridcell")).getByText("Test Row"),
        ).toBeVisible();
        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });
    });

    describe("EE with embedding_sdk token feature", () => {
      it("should show the alert button when plugin and token feature are both enabled", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          enterprisePlugins: ["sdk_notifications"],
        });

        expect(
          within(screen.getByRole("gridcell")).getByText("Test Row"),
        ).toBeVisible();
        expect(
          await screen.findByRole("button", { name: "Alerts" }),
        ).toBeVisible();
      });

      it("should show the alert button for custom layouts when withAlerts is true", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          enterprisePlugins: ["sdk_notifications"],
          children: (
            <div>
              <span>Custom Layout</span>
              <AlertsButton />
            </div>
          ),
        });

        expect(screen.getByText("Custom Layout")).toBeVisible();
        expect(screen.getByRole("button", { name: "Alerts" })).toBeVisible();
      });

      it("should not show the alert button for custom layouts when withAlerts is false", async () => {
        await setup({
          withAlerts: false,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: false,
          enterprisePlugins: ["sdk_notifications"],
          children: (
            <div>
              <span>Custom Layout</span>
              <AlertsButton />
            </div>
          ),
        });

        expect(screen.getByText("Custom Layout")).toBeVisible();
        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });

      it("should not show the alert button when withAlerts is false", async () => {
        await setup({
          withAlerts: false,
          isEmailSetup: true,
          canManageSubscriptions: true,
          enterprisePlugins: ["sdk_notifications"],
        });

        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });

      it("should not show the alert button when email is not configured", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: false,
          canManageSubscriptions: true,
          enterprisePlugins: ["sdk_notifications"],
        });

        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });

      it("should not show the alert button when user cannot manage subscriptions and is not admin", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          isSuperuser: false,
          canManageSubscriptions: false,
          enterprisePlugins: ["sdk_notifications", "application_permissions"],
          tokenFeatures: { embedding_sdk: true, advanced_permissions: true },
        });

        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });

      it("should not show the alert button for models", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          isModel: true,
          enterprisePlugins: ["sdk_notifications"],
        });

        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });

      it("should not show the alert button for analytics collection", async () => {
        await setup({
          withAlerts: true,
          isEmailSetup: true,
          canManageSubscriptions: true,
          collectionType: "instance-analytics",
          enterprisePlugins: ["sdk_notifications"],
        });

        expect(
          screen.queryByRole("button", { name: "Alerts" }),
        ).not.toBeInTheDocument();
      });
    });
  });
}
