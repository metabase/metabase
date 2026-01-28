import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupChangePlanPreviewEndpoint,
  setupGetPlanEndpoint,
  setupTrialAvailableEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { UpgradeModal } from "./UpgradeModal";

const setup = ({ opened = true }: { opened?: boolean } = {}) => {
  const onClose = jest.fn();

  renderWithProviders(<UpgradeModal opened={opened} onClose={onClose} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    }),
  });

  return { onClose };
};

describe("UpgradeModal", () => {
  // State 1: Trial up available
  describe("state 1: trial up available", () => {
    beforeEach(() => {
      setupTrialAvailableEndpoint({
        available: true,
        plan_alias: "pro-cloud",
      });
    });

    it("should show trial UI with $0.00 due today", async () => {
      setup();

      expect(
        await screen.findByText("Start your 14-day trial of Pro"),
      ).toBeInTheDocument();
      expect(screen.getByText("$0.00")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Start your free trial" }),
      ).toBeInTheDocument();
    });

    it("should show the no-charge message instead of plan pricing", async () => {
      setup();

      await screen.findByText("Start your 14-day trial of Pro");

      expect(
        screen.getByText(/we won't charge you automatically/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/After your trial ends:/),
      ).not.toBeInTheDocument();
    });

    it("should only call trial-up-available API", async () => {
      setup();

      await screen.findByText("Start your 14-day trial of Pro");

      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-trial-up-available",
        ),
      ).toBe(true);
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-change-plan-preview",
        ),
      ).toBe(false);
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-proxy/get-plan"),
      ).toBe(false);
    });

    it("should close modal when clicking Cancel", async () => {
      const { onClose } = setup();

      await screen.findByText("Start your 14-day trial of Pro");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalled();
    });
  });

  // State 2: Trial up not available, but currently on trial
  describe("state 2: trial up not available, on trial", () => {
    beforeEach(() => {
      setupTrialAvailableEndpoint({
        available: false,
        plan_alias: "pro-cloud",
      });
      setupChangePlanPreviewEndpoint({
        amount_due_now: 0,
        next_payment_date: "2026-02-15T00:00:00Z",
        next_payment_amount: 57500,
        warnings: null,
      });
      setupGetPlanEndpoint({
        id: 16,
        name: "Metabase Pro Cloud",
        description: "Metabase Pro Cloud",
        alias: "pro-cloud",
        product: "prod_K79Voj2md354w8",
        price: "$575.00",
        per_user_price: "$12.00",
        users_included: 10,
        trial_days: 14,
        billing_period_months: 1,
        can_purchase: true,
        token_features: ["no-upsell"],
        hosting_features: ["custom-domain"],
      });
    });

    it("should show upgrade UI with $0 due and plan pricing", async () => {
      setup();

      expect(
        await screen.findByText("Upgrade to Metabase Pro"),
      ).toBeInTheDocument();
      expect(screen.getByText("$0")).toBeInTheDocument();
      expect(screen.getByText(/After your trial ends:/)).toBeInTheDocument();
      expect(screen.getByText("$575/mo + tax")).toBeInTheDocument();
      expect(
        screen.getByText("Incl. 10 users, then $12/user/mo"),
      ).toBeInTheDocument();
    });

    it("should call all 3 APIs", async () => {
      setup();

      await screen.findByText("Upgrade to Metabase Pro");

      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-trial-up-available",
        ),
      ).toBe(true);
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-change-plan-preview",
        ),
      ).toBe(true);
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-proxy/get-plan"),
      ).toBe(true);
    });
  });

  // State 3: Trial up not available, not on trial
  describe("state 3: trial up not available, not on trial", () => {
    beforeEach(() => {
      setupTrialAvailableEndpoint({
        available: false,
        plan_alias: "pro-cloud",
      });
      setupChangePlanPreviewEndpoint({
        amount_due_now: 50000,
        next_payment_date: "2026-02-15T00:00:00Z",
        next_payment_amount: 57500,
        warnings: null,
      });
    });

    it("should show upgrade UI with amount due", async () => {
      setup();

      expect(
        await screen.findByText("Upgrade to Metabase Pro"),
      ).toBeInTheDocument();
      expect(screen.getByText("$500")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Upgrade to Pro" }),
      ).toBeInTheDocument();
    });

    it("should not show plan pricing", async () => {
      setup();

      await screen.findByText("Upgrade to Metabase Pro");

      expect(
        screen.queryByText(/After your trial ends:/),
      ).not.toBeInTheDocument();
    });

    it("should only call trial-up-available and preview APIs", async () => {
      setup();

      await screen.findByText("Upgrade to Metabase Pro");

      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-trial-up-available",
        ),
      ).toBe(true);
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-change-plan-preview",
        ),
      ).toBe(true);
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-proxy/get-plan"),
      ).toBe(false);
    });

    it("should use plan_alias from trial check for preview request", async () => {
      setup();

      await screen.findByText("Upgrade to Metabase Pro");

      const call = fetchMock.callHistory.lastCall(
        "path:/api/ee/cloud-proxy/mb-plan-change-plan-preview",
        { method: "POST" },
      );
      const body = await call?.request?.json();
      expect(body).toEqual({ "new-plan-alias": "pro-cloud" });
    });
  });
});
