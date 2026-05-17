import { fireEvent, screen } from "@testing-library/react";

import { render } from "__support__/ui-minimal";

import { BodyCell } from "./BodyCell";

describe("BodyCell", () => {
  it("renders the value correctly", () => {
    render(<BodyCell value="Cell Value" columnId="col1" rowIndex={0} />);

    expect(screen.getByText("Cell Value")).toBeInTheDocument();
  });

  it("formats the value when a formatter is provided", () => {
    const formatter = (value: number) => `$${value}`;

    render(
      <BodyCell
        value={100}
        formatter={formatter}
        columnId="price"
        rowIndex={0}
      />,
    );

    expect(screen.getByText("$100")).toBeInTheDocument();
  });

  it("does not show an expand button when canExpand is false", () => {
    render(
      <BodyCell
        value="Expandable"
        canExpand={false}
        columnId="col1"
        rowIndex={0}
      />,
    );

    const expandButton = screen.queryByRole("button");
    expect(expandButton).not.toBeInTheDocument();
  });

  it("does not show expand button when variant is pill", () => {
    render(
      <BodyCell
        value="Pill Variant"
        variant="pill"
        canExpand={true}
        columnId="col1"
        rowIndex={0}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onExpand when the expand button is clicked", () => {
    const handleExpand = jest.fn();

    render(
      <BodyCell
        value="Expandable"
        formatter={(value) => `formatted:${value}`}
        canExpand={true}
        columnId="col1"
        rowIndex={0}
        onExpand={handleExpand}
      />,
    );

    const expandButton = screen.getByRole("button");
    fireEvent.click(expandButton);

    expect(handleExpand).toHaveBeenCalledTimes(1);
    expect(handleExpand).toHaveBeenCalledWith("col1", "formatted:Expandable");
  });
});
