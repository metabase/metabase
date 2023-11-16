import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import { BulkFilterModal } from "./BulkFilterModal";

type SetupOpts = {
  query?: Lib.Query;
};

function setup({ query = createQuery() }: SetupOpts = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <BulkFilterModal
      query={query}
      opened
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );

  function getNextQuery() {
    const [query] = onSubmit.mock.lastCall;
    return query;
  }

  function getNextFilterParts(stageIndex = 0) {
    const query = getNextQuery();
    return Lib.filters(query, stageIndex).map(filter =>
      Lib.filterParts(query, stageIndex, filter),
    );
  }

  return { getNextFilterParts, onSubmit, onClose };
}

describe("BulkFilterModal", () => {
  it("should display a list of columns", () => {
    setup();

    expect(screen.getByRole("heading")).toHaveTextContent("Filter by");

    expect(screen.getByText("User ID")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();

    expect(screen.queryByText("Rating")).not.toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();

    userEvent.click(screen.getByRole("tab", { name: "Product" }));

    expect(screen.getByText("Rating")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();

    expect(screen.queryByText("User ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Discount")).not.toBeInTheDocument();
  });

  it("should navigate between column groups", () => {
    setup();

    expect(screen.getByRole("tablist")).toBeInTheDocument();

    const orderTab = screen.getByRole("tab", { name: "Order" });
    const userTab = screen.getByRole("tab", { name: "User" });
    const productTab = screen.getByRole("tab", { name: "Product" });

    expect(orderTab).toHaveAttribute("aria-selected", "true");
    expect(productTab).toHaveAttribute("aria-selected", "false");
    expect(userTab).toHaveAttribute("aria-selected", "false");

    userEvent.click(productTab);

    expect(orderTab).toHaveAttribute("aria-selected", "false");
    expect(productTab).toHaveAttribute("aria-selected", "true");
    expect(userTab).toHaveAttribute("aria-selected", "false");
  });

  it("should not display navigation when there's only one column group", () => {
    const query = Lib.withDifferentTable(createQuery(), PRODUCTS_ID);
    setup({ query });

    expect(screen.getByRole("heading")).toHaveTextContent("Filter Products by");

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    expect(screen.queryByText(/Order(s?)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Review(s?)/)).not.toBeInTheDocument();
    expect(screen.queryByText("Product")).not.toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });

  it("should disable submit when there're no changes", () => {
    setup();
    const applyButton = screen.getByRole("button", { name: "Apply filters" });
    expect(applyButton).toBeDisabled();
  });

  it("should close", () => {
    const { onClose } = setup();
    userEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
