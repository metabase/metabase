import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

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
  childRecords: {
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
    fetchMock.reset();
  });

  afterEach(() => {
    fetchMock.restore();
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
        childRecords: {
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
        childRecords: {
          "2": 1,
        },
      });

      await waitFor(() => {
        expect(screen.getByText("1 record")).toBeInTheDocument();
      });
    });

    it("should use plural form for counts > 1", async () => {
      setup({
        childRecords: {
          "2": 5,
        },
      });

      await waitFor(() => {
        expect(screen.getByText("5 records")).toBeInTheDocument();
      });
    });

    it("should show fallback table name when API fails", async () => {
      // Mock GET /api/table/999 to return a 404 error
      fetchMock.getOnce("path:/api/table/999", {
        status: 404,
        body: { message: "Not found" },
      });

      renderWithProviders(
        <ForeignKeyConstraintModal
          opened={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          childRecords={{ "999": 5 }}
          message={defaultProps.message}
        />,
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

      const confirmButton = screen.getByRole("button", {
        name: "Delete this and linked records",
      });
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
      setup({ childRecords: {} });

      expect(
        screen.getByText("Delete this and all linked records?"),
      ).toBeInTheDocument();
      // Should not crash and should still show the modal
    });

    it("should handle undefined children", () => {
      setup({ childRecords: undefined });

      expect(
        screen.getByText("Delete this and all linked records?"),
      ).toBeInTheDocument();
    });
  });
});
