import { screen, waitFor, within } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";

import type { SetupSdkDashboardOptions } from "../tests/setup";

export function addSubscriptionTests(
  setup: (
    options?: Omit<SetupSdkDashboardOptions, "component">,
  ) => Promise<{ dashboard: Dashboard }>,
) {
  describe("Subscriptions Button", () => {
    it.each([
      {
        isSlackConfigured: false,
      },
      {
        isSlackConfigured: false,
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
        withSubscriptions: false,
      },
      {
        isEmailConfigured: false,
        isSlackConfigured: false,
        withSubscriptions: true,
      },
      {
        isEmailConfigured: false,
        isSlackConfigured: true,
        withSubscriptions: false,
      },
      {
        isEmailConfigured: false,
        isSlackConfigured: true,
        withSubscriptions: true,
      },
      {
        isEmailConfigured: true,
        isSlackConfigured: false,
        withSubscriptions: false,
      },
      {
        isEmailConfigured: true,
        isSlackConfigured: true,
        withSubscriptions: false,
      },
    ])(
      "should not show subscriptions button if subscriptions are disabled or email is not configured (isEmailConfigured: $isEmailConfigured, isSlackConfigured: $isSlackConfigured, withSubscriptions: $withSubscriptions)",
      async ({ isEmailConfigured, isSlackConfigured, withSubscriptions }) => {
        await setup({
          props: { withSubscriptions },
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
  });
}
