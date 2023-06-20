/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectBannerToBeHidden"] }] */
import { render, screen } from "__support__/ui";

import type { TokenStatusStatus } from "metabase-types/api";

import { PaymentBanner, shouldRenderPaymentBanner } from "./PaymentBanner";

interface SetupOpts {
  isAdmin: boolean;
  tokenStatusStatus: TokenStatusStatus;
}

function setup({ isAdmin, tokenStatusStatus }: SetupOpts) {
  render(
    <PaymentBanner isAdmin={isAdmin} tokenStatusStatus={tokenStatusStatus} />,
  );
}

const PAST_DUE_BANNER_REGEX =
  /We couldn't process payment for your account. Please/;

const UNPAID_BANNER_REGEX =
  /Pro features won’t work right now due to lack of payment\./;

describe("PaymentBanner", () => {
  describe("admin users", () => {
    it("should render past-due banner when token status status is `past-due`", () => {
      setup({
        isAdmin: true,
        tokenStatusStatus: "past-due",
      });

      expect(screen.getByText(PAST_DUE_BANNER_REGEX)).toBeInTheDocument();
    });

    it("should render unpaid banner when token status status is `unpaid`", () => {
      setup({
        isAdmin: true,
        tokenStatusStatus: "unpaid",
      });

      expect(screen.getByText(UNPAID_BANNER_REGEX)).toBeInTheDocument();
    });

    it("should not render any banner when token status status is not `past-due` or `unpaid`", () => {
      setup({
        isAdmin: true,
        tokenStatusStatus: "something-else",
      });

      expectBannerToBeHidden();
    });
  });

  describe("non-admin users", () => {
    it.each([
      {
        tokenStatusStatus: "past-due",
      },
      {
        tokenStatusStatus: "unpaid",
      },
      {
        tokenStatusStatus: "something-else",
      },
    ])(
      "should not render any banner when tokenStatusStatus is `$tokenStatusStatus`",
      ({ tokenStatusStatus }) => {
        setup({ isAdmin: false, tokenStatusStatus });

        expectBannerToBeHidden();
      },
    );
  });

  describe("shouldRenderPaymentBanner", () => {
    it.each([
      {
        isAdmin: true,
        tokenStatusStatus: "past-due",
        hasBanner: true,
      },
      {
        isAdmin: true,
        tokenStatusStatus: "unpaid",
        hasBanner: true,
      },
      {
        isAdmin: true,
        tokenStatusStatus: "something-else",
        hasBanner: false,
      },
      {
        isAdmin: false,
        tokenStatusStatus: "past-due",
        hasBanner: false,
      },
      {
        isAdmin: false,
        tokenStatusStatus: "unpaid",
        hasBanner: false,
      },
      {
        isAdmin: false,
        tokenStatusStatus: "something-else",
        hasBanner: false,
      },
    ])(
      "should return `${shouldRenderPaymentBanner} when isAdmin: $isAdmin, and tokenStatusStatus: $tokenStatusStatus`",
      ({ isAdmin, tokenStatusStatus, hasBanner }) => {
        expect(
          shouldRenderPaymentBanner({ isAdmin, tokenStatusStatus }),
        ).toEqual(hasBanner);
      },
    );
  });
});

function expectBannerToBeHidden() {
  expect(screen.queryByText(PAST_DUE_BANNER_REGEX)).not.toBeInTheDocument();
  expect(screen.queryByText(UNPAID_BANNER_REGEX)).not.toBeInTheDocument();
}
