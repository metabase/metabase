import { screen, waitFor, within } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";

import type { SetupSdkDashboardOptions } from "../tests/setup";

type SetupOpts = Omit<SetupSdkDashboardOptions, "component">;

export function addCommonSubscriptionsTests(
  setup: (options?: SetupOpts) => Promise<{ dashboard: Dashboard }>,
) {
  describe("Subscriptions Button", () => {
    it.each([
      { isSlackConfigured: false, isEmailConfigured: false },
      { isSlackConfigured: false, isEmailConfigured: true },
      { isSlackConfigured: true, isEmailConfigured: false },
      { isSlackConfigured: true, isEmailConfigured: true },
    ])(
      "should not show subscriptions button without `embedding_sdk` token feature (isSlackConfigured: $isSlackConfigured, isEmailConfigured: $isEmailConfigured)",
      async ({ isSlackConfigured, isEmailConfigured }) => {
        await setup({
          props: { withSubscriptions: true },
          isEmailConfigured,
          isSlackConfigured,
        });
      },
    );
  });
}

export const addEnterpriseSubscriptionsTests = addCommonSubscriptionsTests;

export function addPremiumSubscriptionsTests(
  setup: (options?: SetupOpts) => Promise<{ dashboard: Dashboard }>,
) {
  describe("Subscriptions Button", () => {
    it.each([
      {
        isSlackConfigured: false,
      },
      {
        isSlackConfigured: true,
      },
    ])(
      "should show subscriptions button if subscriptions are enabled and email is set up (isSlackConfigured: $isSlackConfigured)",
      async ({ isSlackConfigured }) => {
        await setup({
          props: { withSubscriptions: true },
          isEmailConfigured: true,
          isSlackConfigured,
        });

        await waitFor(() => {
          expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
        });

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          await dashboardHeader.findByLabelText("Subscriptions"),
        ).toBeInTheDocument();

        // TODO (Kelvin 2025-11-17) add more assertions when working on EMB-976. e.g. when clicking the button the sidebar is correctly shown.
      },
    );

    it.each([
      {
        isEmailConfigured: false,
        isSlackConfigured: false,
      },
      {
        isEmailConfigured: false,
        isSlackConfigured: true,
      },
      {
        isEmailConfigured: true,
        isSlackConfigured: false,
      },
      {
        isEmailConfigured: true,
        isSlackConfigured: true,
      },
    ])(
      "should not show subscriptions button if subscriptions are disabled (isEmailConfigured: $isEmailConfigured, isSlackConfigured: $isSlackConfigured)",
      async ({ isEmailConfigured, isSlackConfigured }) => {
        await setup({
          props: { withSubscriptions: false },
          isEmailConfigured,
          isSlackConfigured,
        });

        await waitFor(() => {
          expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
        });

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          dashboardHeader.queryByLabelText("Subscriptions"),
        ).not.toBeInTheDocument();
      },
    );

    it.each([
      {
        isSlackConfigured: false,
        withSubscriptions: false,
      },
      {
        isSlackConfigured: false,
        withSubscriptions: true,
      },
      {
        isSlackConfigured: true,
        withSubscriptions: false,
      },
      {
        isSlackConfigured: true,
        withSubscriptions: true,
      },
    ])(
      "should not show subscriptions button if email is not configured (isSlackConfigured: $isSlackConfigured, withSubscriptions: $withSubscriptions)",
      async ({ isSlackConfigured, withSubscriptions }) => {
        await setup({
          props: { withSubscriptions },
          isEmailConfigured: false,
          isSlackConfigured,
        });

        await waitFor(() => {
          expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
        });

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          dashboardHeader.queryByLabelText("Subscriptions"),
        ).not.toBeInTheDocument();
      },
    );
  });
}
