import { waitFor } from "@testing-library/react";

import { screen } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";

import type { SetupSdkDashboardOptions } from "../tests/setup";

type SetupOpts = Omit<SetupSdkDashboardOptions, "component">;
type SetupResult = { dashboard: Dashboard; batchCalls: { url: string }[] };

export function addEnterpriseAutoRefreshTests(
  setup: (options?: SetupOpts) => Promise<SetupResult>,
) {
  describe("autoRefreshInterval property", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("should support auto-refreshing dashboards for positive integers", async () => {
      jest.useFakeTimers();

      const { batchCalls } = await setup({
        props: { autoRefreshInterval: 10 },
      });

      await waitFor(() => {
        expect(batchCalls.length).toBe(1);
      });

      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(batchCalls.length).toBe(2);
      });

      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(batchCalls.length).toBe(3);
      });
    });

    it("should show the auto-refresh indicator in the dashboard header for positive integers", async () => {
      await setup({ props: { autoRefreshInterval: 10 } });

      expect(
        screen.getByRole("button", { name: "Auto Refresh" }),
      ).toBeVisible();
    });

    describe.each([
      { name: "null", value: null },
      { name: "undefined", value: undefined },
      { name: "0", value: 0 },
      { name: "negative", value: -10 },
    ])("when interval is $name", ({ value }) => {
      it("should not auto-refresh", async () => {
        jest.useFakeTimers();

        // Forces the type, because users can literally pass any type here
        const { batchCalls } = await setup({
          props: { autoRefreshInterval: value as number },
        });

        await waitFor(() => {
          expect(batchCalls.length).toBe(1);
        });

        jest.advanceTimersByTime(30_000);

        expect(batchCalls.length).toBe(1);
      });

      it("should not show the auto-refresh indicator in the dashboard header", async () => {
        // Forces the type, because users can literally pass any type here
        await setup({ props: { autoRefreshInterval: value as number } });

        expect(
          screen.queryByRole("button", { name: "Auto Refresh" }),
        ).not.toBeInTheDocument();
      });
    });
  });
}

export const addPremiumAutoRefreshTests = addEnterpriseAutoRefreshTests;
