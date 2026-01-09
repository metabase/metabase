import { screen, within } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";

import type { SetupSdkDashboardOptions } from "../tests/setup";

type SetupOpts = Omit<SetupSdkDashboardOptions, "component">;

export function addEnterpriseSubscriptionsTests(
  setup: (options?: SetupOpts) => Promise<{ dashboard: Dashboard }>,
) {
  describe(`Subscriptions Button (enterprise)`, () => {
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

        expect(
          await screen.findByTestId("dashboard-header"),
        ).toBeInTheDocument();

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          dashboardHeader.queryByLabelText("Subscriptions"),
        ).not.toBeInTheDocument();
      },
    );
  });
}

export function addPremiumSubscriptionsTests(
  setup: (options?: SetupOpts) => Promise<{ dashboard: Dashboard }>,
) {
  describe("Subscriptions Button (premium)", () => {
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

        expect(
          await screen.findByTestId("dashboard-header"),
        ).toBeInTheDocument();

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          await dashboardHeader.findByLabelText("Subscriptions"),
        ).toBeInTheDocument();
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

        expect(
          await screen.findByTestId("dashboard-header"),
        ).toBeInTheDocument();

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

        expect(
          await screen.findByTestId("dashboard-header"),
        ).toBeInTheDocument();

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          dashboardHeader.queryByLabelText("Subscriptions"),
        ).not.toBeInTheDocument();
      },
    );
  });
}
