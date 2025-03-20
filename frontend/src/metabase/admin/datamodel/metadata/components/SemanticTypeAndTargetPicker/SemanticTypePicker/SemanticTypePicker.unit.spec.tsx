import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import { TYPE } from "metabase-lib/v1/types/constants";

import { SemanticTypePicker } from "./SemanticTypePicker";

interface SetupOpts {
  initialValue?: string | null;
}

function TestComponent({ initialValue = null }: SetupOpts) {
  const [value, setValue] = useState<string | null>(initialValue);

  return <SemanticTypePicker value={value} onChange={setValue} />;
}

const setup = ({ initialValue }: SetupOpts = {}) => {
  renderWithProviders(<TestComponent initialValue={initialValue} />);
};

describe("SemanticTypePicker", () => {
  it("does not show deprecated semantic types", async () => {
    setup();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });

  it("shows deprecated semantic type if it is already selected", async () => {
    setup({ initialValue: TYPE.CancelationDate });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Creation date")).toBeInTheDocument();
    expect(dropdown.getByText("Cancelation date")).toBeInTheDocument();
  });

  it("hides deprecated semantic type after it is deselected", async () => {
    setup({ initialValue: TYPE.CancelationDate });

    expect(screen.getByText("Cancelation date")).toBeInTheDocument();

    const picker = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(picker);
    const dropdown = within(screen.getByRole("listbox"));
    await userEvent.click(dropdown.getByText("Creation date"));
    await userEvent.click(picker);

    expect(dropdown.queryByText("Cancelation date")).not.toBeInTheDocument();
  });
});
