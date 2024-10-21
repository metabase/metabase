import dayjs from "dayjs";
import { Route } from "react-router";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenStatus } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { AppBanner } from "./AppBanner";

interface SetupOpts {
  bannerDismissalTimestamp?: number;
  isAdmin: boolean;
  isHosted?: boolean;
  isReadOnly?: boolean;
  tokenStatus?: TokenStatus | null;
}
const TEST_DB = createSampleDatabase();

const DATA_WAREHOUSE_DB = createMockDatabase({ id: 2 });

function setup({
  bannerDismissalTimestamp,
  isAdmin,
  isHosted = false,
  isReadOnly = false,
  tokenStatus,
}: SetupOpts) {
  setupDatabasesEndpoints([TEST_DB, DATA_WAREHOUSE_DB]);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "is-hosted?": isHosted,
      "read-only-mode": isReadOnly,
      "token-status": createMockTokenStatus(tokenStatus ?? {}),
      "trial-banner-dismissal-timestamp": bannerDismissalTimestamp,
    }),
  });

  renderWithProviders(<Route path="*" component={AppBanner} />, {
    initialRoute: "/",
    storeInitialState: state,
    withRouter: true,
  });
}

describe("AppBanner", () => {
  it("should not render for non admins", () => {
    setup({ isAdmin: false });

    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  describe("PaymentBanner", () => {
    const token = {
      valid: false,
      trial: false,
    };

    it("should render past-due banner for admin user with tokenStatusStatus: past-due", () => {
      setup({
        isAdmin: true,
        tokenStatus: { ...token, status: "past-due" },
      });

      expect(
        screen.getByText(/We couldn't process payment for your account\./),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          /Pro features won't work right now due to lack of payment\./,
        ),
      ).not.toBeInTheDocument();
    });

    it("should render unpaid banner for admin user with tokenStatusStatus: unpaid", () => {
      setup({
        isAdmin: true,
        tokenStatus: { ...token, status: "unpaid" },
      });

      expect(
        screen.queryByText(/We couldn't process payment for your account\./),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /Pro features won't work right now due to lack of payment\./,
        ),
      ).toBeInTheDocument();
    });

    it("should render an error with details when the token is `invalid`", () => {
      setup({
        isAdmin: true,
        tokenStatus: {
          ...token,
          status: "invalid",
          "error-details": "This is a critical damage.",
        },
      });

      expect(
        screen.getByText(/This is a critical damage\./),
      ).toBeInTheDocument();
    });

    it("should not render for admin user with tokenStatusStatus: something-else", () => {
      setup({
        isAdmin: true,
        tokenStatus: { ...token, status: "something-else" },
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it("should not render when token status is missing", () => {
      setup({
        isAdmin: true,
        tokenStatus: { ...token, status: undefined },
      });

      expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
    });

    it.each(["past-due", "unpaid", "invalid"])(
      "should not render for hosted instances for %s token status (metabase#50335)",
      status => {
        setup({
          isAdmin: true,
          isHosted: true,
          tokenStatus: { ...token, status },
        });

        expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
      },
    );
  });

  describe("ReadOnlyBanner", () => {
    it("should render if Metabase is in read-only mode", () => {
      setup({
        isAdmin: true,
        isReadOnly: true,
      });

      expect(
        screen.getByText(
          "Metabase is under maintenance and is operating in read-only mode. It should only take up to 30 minutes.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("TrialBanner", () => {
    const token = {
      valid: true,
      trial: true,
    };

    const getTokenExpiryDate = (daysRemaining: number) => {
      return (
        dayjs()
          .add(daysRemaining, "days")
          // Safety buffer - even a second would do but we want to
          // account for the slower testing environments, like CI.
          .add(1, "minute")
          .toISOString()
      );
    };

    const getCopy = (daysRemaining: number) => {
      if (daysRemaining === 0) {
        return "Today is the last day of your trial.";
      }

      return `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left in your trial.`;
    };

    const copyRegex = new RegExp("days? left in your trial.$");

    it("should not render if there is no information about the token", () => {
      setup({
        isAdmin: true,
        isHosted: true,
        tokenStatus: null,
      });

      expect(screen.queryByText(copyRegex)).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("should not render for self-hosted instances", () => {
      setup({
        isAdmin: true,
        isHosted: false,
        tokenStatus: token,
      });

      expect(screen.queryByText(copyRegex)).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("should not render if token is not in trial", () => {
      setup({
        isAdmin: true,
        isHosted: true,
        tokenStatus: { ...token, trial: false },
      });

      expect(screen.queryByText(copyRegex)).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it.each([11, 3, 2, 1, 0])(
      "should render if the banner was never dismissed with %s day(s) remaining in the trial",
      daysRemaining => {
        const tokenExpiryDate = getTokenExpiryDate(daysRemaining);

        setup({
          bannerDismissalTimestamp: undefined,
          isAdmin: true,
          isHosted: true,
          tokenStatus: {
            ...token,
            "valid-thru": tokenExpiryDate,
          },
        });

        expect(screen.getByText(getCopy(daysRemaining))).toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: "Manage your subscription." }),
        ).toBeInTheDocument();
      },
    );

    it.each(["before", "after"])(
      "should not render if the banner was dismissed at any point with more than 3 days remaining in the trial",
      dismissed => {
        const daysRemaining = 5;
        const now = dayjs();
        const tokenExpiryDate = getTokenExpiryDate(daysRemaining);
        const dismissalTimestampBefore = now.subtract(15, "minutes").unix();
        const dismissalTimestampAfter = now.add(15, "minutes").unix();

        setup({
          bannerDismissalTimestamp:
            dismissed === "before"
              ? dismissalTimestampBefore
              : dismissalTimestampAfter,
          isAdmin: true,
          isHosted: true,
          tokenStatus: {
            ...token,
            "valid-thru": tokenExpiryDate,
          },
        });

        expect(screen.queryByText(copyRegex)).not.toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
      },
    );

    describe("with 3 days or less remaining in the trial", () => {
      it.each([3, 2, 1, 0])(
        "%s day(s) remaining: should render if the banner dismissal is stale",
        daysRemaining => {
          const now = dayjs();
          const tokenExpiryDate = now
            .add(daysRemaining, "days")
            .add(1, "minute")
            .toISOString();
          const staleDismissalTimestamp = now.subtract(15, "minutes").unix();

          setup({
            bannerDismissalTimestamp: staleDismissalTimestamp,
            isAdmin: true,
            isHosted: true,
            tokenStatus: {
              ...token,
              "valid-thru": tokenExpiryDate,
            },
          });

          expect(screen.getByText(getCopy(daysRemaining))).toBeInTheDocument();
          expect(
            screen.getByRole("link", { name: "Manage your subscription." }),
          ).toBeInTheDocument();
        },
      );

      it.each([3, 2, 1, 0])(
        "should not render if the banner was dismissed after it reappeared on the %s day mark",
        daysRemaining => {
          const now = dayjs();
          const tokenExpiryDate = now
            .add(daysRemaining, "days")
            .add(1, "minute")
            .toISOString();
          const freshDismissalTimestamp = now.add(15, "minutes").unix();

          setup({
            bannerDismissalTimestamp: freshDismissalTimestamp,
            isAdmin: true,
            isHosted: true,
            tokenStatus: {
              ...token,
              "valid-thru": tokenExpiryDate,
            },
          });

          expect(screen.queryByText(copyRegex)).not.toBeInTheDocument();
          expect(screen.queryByRole("link")).not.toBeInTheDocument();
        },
      );
    });
  });
});
