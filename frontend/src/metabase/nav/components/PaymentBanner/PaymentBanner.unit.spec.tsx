/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectBannerToBeHidden"] }] */
import { render, screen } from "__support__/ui";
import type { TokenStatus } from "metabase-types/api";

import { PaymentBanner, shouldRenderPaymentBanner } from "./PaymentBanner";

interface SetupOpts {
  isAdmin: boolean;
  tokenStatus: TokenStatus;
}

function setup({ isAdmin, tokenStatus }: SetupOpts) {
  render(<PaymentBanner isAdmin={isAdmin} tokenStatus={tokenStatus} />);
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
        tokenStatus: { status: "past-due", valid: false, trial: false },
      });

      expect(screen.getByText(PAST_DUE_BANNER_REGEX)).toBeInTheDocument();
    });

    it("should render unpaid banner when token status status is `unpaid`", () => {
      setup({
        isAdmin: true,
        tokenStatus: { status: "unpaid", valid: false, trial: false },
      });

      expect(screen.getByText(UNPAID_BANNER_REGEX)).toBeInTheDocument();
    });

    it("should render an error with details when the token is `invalid`", () => {
      setup({
        isAdmin: true,
        tokenStatus: {
          status: "invalid",
          valid: false,
          trial: false,
          "error-details": "This is critical damage.",
        },
      });

      expect(screen.getByText(/This is critical damage\./)).toBeInTheDocument();
    });

    it("should not render any banner when token status status is not `past-due` or `unpaid`", () => {
      setup({
        isAdmin: true,
        tokenStatus: { status: "something-else", valid: false, trial: false },
      });

      expectBannerToBeHidden();
    });
  });

  describe("non-admin users", () => {
    it.each([
      {
        tokenStatus: { status: "past-due", valid: false, trial: false },
      },
      {
        tokenStatus: { status: "unpaid", valid: false, trial: false },
      },
      {
        tokenStatus: { status: "something-else", valid: false, trial: false },
      },
    ])(
      "should not render any banner when tokenStatus.status is `${tokenStatus.status}`",
      ({ tokenStatus }) => {
        setup({ isAdmin: false, tokenStatus });

        expectBannerToBeHidden();
      },
    );
  });

  describe("shouldRenderPaymentBanner", () => {
    it.each([
      {
        isAdmin: true,
        tokenStatus: { status: "past-due", valid: false, trial: false },
        hasBanner: true,
      },
      {
        isAdmin: true,
        tokenStatus: { status: "unpaid", valid: false, trial: false },
        hasBanner: true,
      },
      {
        isAdmin: true,
        tokenStatus: { status: "invalid", valid: false, trial: false },
        hasBanner: true,
      },
      {
        isAdmin: true,
        tokenStatus: { status: "something-else", valid: false, trial: false },
        hasBanner: false,
      },
      {
        isAdmin: false,
        tokenStatus: { status: "past-due", valid: false, trial: false },
        hasBanner: false,
      },
      {
        isAdmin: false,
        tokenStatus: { status: "unpaid", valid: false, trial: false },
        hasBanner: false,
      },
      {
        isAdmin: false,
        tokenStatus: { status: "invalid", valid: false, trial: false },
        hasBanner: false,
      },
      {
        isAdmin: false,
        tokenStatus: { status: "something-else", valid: false, trial: false },
        hasBanner: false,
      },
    ])(
      "should return `${shouldRenderPaymentBanner} when isAdmin: $isAdmin, and tokenStatus.status: ${tokenStatus.status}`",
      ({ isAdmin, tokenStatus, hasBanner }) => {
        expect(shouldRenderPaymentBanner({ isAdmin, tokenStatus })).toEqual(
          hasBanner,
        );
      },
    );
  });
});

function expectBannerToBeHidden() {
  expect(screen.queryByText(PAST_DUE_BANNER_REGEX)).not.toBeInTheDocument();
  expect(screen.queryByText(UNPAID_BANNER_REGEX)).not.toBeInTheDocument();
}
