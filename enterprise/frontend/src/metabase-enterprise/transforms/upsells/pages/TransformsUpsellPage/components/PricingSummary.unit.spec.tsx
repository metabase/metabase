import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { PricingSummary } from "./PricingSummary";

const defaultProps: ComponentProps<typeof PricingSummary> = {
  dueTodayAmount: 100,
  isOnTrial: false,
  selectedTier: "basic",
};

describe("PricingSummary", () => {
  beforeEach(() => {
    fetchMock.post("path:/api/ee/cloud-add-ons/transforms-advanced", 200);
    fetchMock.post("path:/api/ee/cloud-add-ons/transforms-basic", 200);
    setupPropertiesEndpoints(createMockSettings());
  });

  describe("confirm button", () => {
    it("says 'Add to trial' when instance is currently on trial", () => {
      renderWithProviders(
        <PricingSummary {...defaultProps} dueTodayAmount={0} isOnTrial />,
      );
      expect(screen.getByRole("button")).toHaveTextContent("Add to trial");
    });

    it("says 'Start trial' when not on trial but trial is available (due today = 0)", () => {
      renderWithProviders(
        <PricingSummary
          {...defaultProps}
          dueTodayAmount={0}
          isOnTrial={false}
        />,
      );
      expect(screen.getByRole("button")).toHaveTextContent("Start trial");
    });

    it("says 'Confirm purchase' when not on trial and trial is not available (due today > 0)", () => {
      renderWithProviders(<PricingSummary {...defaultProps} />);
      expect(screen.getByRole("button")).toHaveTextContent("Confirm purchase");
    });

    it("renders correct loading text when selected tier is basic", async () => {
      renderWithProviders(
        <PricingSummary {...defaultProps} selectedTier="basic" />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Confirm purchase" }),
      );
      expect(
        screen.getByText("Setting up transforms, please wait"),
      ).toBeInTheDocument();
    });

    it("renders correct loading heading when selected tier is advanced", async () => {
      renderWithProviders(
        <PricingSummary {...defaultProps} selectedTier="advanced" />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Confirm purchase" }),
      );
      expect(
        screen.getByText("Setting up Python transforms, please wait"),
      ).toBeInTheDocument();
    });
  });
});
