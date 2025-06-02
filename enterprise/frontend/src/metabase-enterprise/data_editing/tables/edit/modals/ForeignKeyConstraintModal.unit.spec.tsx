import userEvent from "@testing-library/user-event";

import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockTable } from "metabase-types/api/mocks";

import { ForeignKeyConstraintModal } from "./ForeignKeyConstraintModal";

const mockOnClose = jest.fn();
const mockOnConfirm = jest.fn();

const defaultProps = {
  opened: true,
  onClose: mockOnClose,
  onConfirm: mockOnConfirm,
  isLoading: false,
  children: {
    "2": 3,
    "3": 10,
    "4": 1,
  },
  message: "Custom error message",
};

// Mock tables for API responses
const mockTables = [
  createMockTable({ id: 2, display_name: "Orders" }),
  createMockTable({ id: 3, display_name: "Order Items" }),
  createMockTable({ id: 4, display_name: "Products" }),
];

function setup(props = {}) {
  // Setup each table individually
  mockTables.forEach((table) => setupTableEndpoints(table));

  return renderWithProviders(
    <ForeignKeyConstraintModal {...defaultProps} {...props} />,
  );
}

describe("ForeignKeyConstraintModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("modal display", () => {
    it("should render modal with correct title", () => {
      setup();
      expect(
        screen.getByText("Delete this and all linked records?"),
      ).toBeInTheDocument();
    });

    it("should render default message when no custom message provided", () => {
      setup({ message: undefined });
      expect(
        screen.getByText(
          /This record is linked to other records in connected tables/,
        ),
      ).toBeInTheDocument();
    });

    it("should render custom message when provided", () => {
      setup();
      expect(screen.getByText("Custom error message")).toBeInTheDocument();
    });

    it("should not render modal when closed", () => {
      setup({ opened: false });
      expect(
        screen.queryByText("Delete this and all linked records?"),
      ).not.toBeInTheDocument();
    });
  });

  describe("table information display", () => {
    it("should display table names and record counts", async () => {
      setup();

      // Wait for table names to load
      await waitFor(() => {
        expect(screen.getByText("3 records")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText("Orders")).toBeInTheDocument();
      });

      expect(screen.getByText("10 records")).toBeInTheDocument();
      expect(screen.getByText("Order Items")).toBeInTheDocument();

      expect(screen.getByText("1 record")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
    });

    it("should display 50+ for counts over 50", async () => {
      setup({
        children: {
          "2": 75,
          "3": 50,
        },
      });

      await waitFor(() => {
        expect(screen.getByText("50+ records")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText("50 records")).toBeInTheDocument();
      });
    });

    it("should use singular form for count of 1", async () => {
      setup({
        children: {
          "2": 1,
        },
      });

      await waitFor(() => {
        expect(screen.getByText("1 record")).toBeInTheDocument();
      });
    });

    it("should use plural form for counts > 1", async () => {
      setup({
        children: {
          "2": 5,
        },
      });

      await waitFor(() => {
        expect(screen.getByText("5 records")).toBeInTheDocument();
      });
    });

    it("should show fallback table name when API fails", async () => {
      // Don't setup table endpoints to simulate API failure
      renderWithProviders(
        <ForeignKeyConstraintModal {...defaultProps}>
          {{ "999": 5 }}
        </ForeignKeyConstraintModal>,
      );

      await waitFor(() => {
        expect(screen.getByText("Table 999")).toBeInTheDocument();
      });
    });
  });

  describe("button interactions", () => {
    it("should call onConfirm when confirm button is clicked", async () => {
      setup();

      const confirmButton = screen.getByText("Delete this and linked records");
      await userEvent.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when cancel button is clicked", async () => {
      setup();

      const cancelButton = screen.getByText("Cancel");
      await userEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should show loading state on confirm button", () => {
      setup({ isLoading: true });

      const confirmButton = screen.getByText("Delete this and linked records");
      expect(confirmButton).toBeDisabled();
    });

    it("should close modal when escape key is pressed", async () => {
      setup();

      // Press escape key to close modal
      await userEvent.keyboard("{Escape}");

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("empty children handling", () => {
    it("should handle empty children object", () => {
      setup({ children: {} });

      expect(
        screen.getByText("Delete this and all linked records?"),
      ).toBeInTheDocument();
      // Should not crash and should still show the modal
    });

    it("should handle undefined children", () => {
      setup({ children: undefined });

      expect(
        screen.getByText("Delete this and all linked records?"),
      ).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA attributes", () => {
      setup();

      const modal = screen.getByRole("dialog");
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute("aria-modal", "true");
    });

    it("should focus confirm button by default", () => {
      setup();

      const confirmButton = screen.getByText("Delete this and linked records");
      expect(confirmButton).toHaveFocus();
    });

    it("should trap focus within modal", async () => {
      setup();

      const cancelButton = screen.getByText("Cancel");
      const confirmButton = screen.getByText("Delete this and linked records");

      // Tab should cycle between buttons
      await userEvent.tab();
      expect(cancelButton).toHaveFocus();

      await userEvent.tab();
      expect(confirmButton).toHaveFocus();
    });
  });
});
