import { render, fireEvent, screen, getIcon } from "__support__/ui";

import { DataPermissionValue } from "../../types";

import { PermissionsSelect } from "./PermissionsSelect";

const options = [
  {
    label: "Allowed",
    value: "all",
    icon: "check",
    iconColor: "green",
  },
  {
    label: "Limited",
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconColor: "blue",
  },
  {
    label: "No access",
    value: "none",
    icon: "close",
    iconColor: "yellow",
  },
];

describe("PermissionSelect", () => {
  it("shows selected option", () => {
    render(<PermissionsSelect options={options} value="all" />);
    expect(screen.getByText("Allowed")).toBeInTheDocument();
  });

  it("when clicked shows options except selected", () => {
    render(<PermissionsSelect options={options} value="all" />);

    fireEvent.click(screen.getByText("Allowed"));

    const optionsList = screen.getByRole("listbox");
    expect(optionsList).toBeInTheDocument();

    const [limited, noAccess, ...rest] = screen.getAllByRole("option");
    expect(rest).toEqual([]);

    expect(limited).toHaveTextContent("Limited");
    expect(noAccess).toHaveTextContent("No access");
  });

  it("selects an option", () => {
    const onChangeMock = jest.fn();
    render(
      <PermissionsSelect
        options={options}
        value="all"
        onChange={onChangeMock}
      />,
    );

    const selected = screen.queryByText("Allowed");
    fireEvent.click(selected);

    const optionsList = screen.getByRole("listbox");
    expect(optionsList).toBeInTheDocument();

    const [limited] = screen.getAllByRole("option");
    fireEvent.click(limited);

    expect(onChangeMock).toHaveBeenCalledWith(
      DataPermissionValue.CONTROLLED,
      null,
    );
  });

  it("does not show options after click when disabled", () => {
    render(
      <PermissionsSelect options={options} value="all" isDisabled={true} />,
    );

    const selected = screen.queryByText("Allowed");
    fireEvent.click(selected);

    const optionsList = screen.queryByRole("listbox");
    expect(optionsList).not.toBeInTheDocument();

    fireEvent.mouseEnter(selected);
  });

  it("shows warning", () => {
    const WARNING = "warning test";
    render(
      <PermissionsSelect options={options} value="all" warning={WARNING} />,
    );

    expect(getIcon("warning")).toBeInTheDocument();

    fireEvent.mouseEnter(getIcon("warning"));
    const warningTooltip = screen.queryByText(WARNING);

    expect(warningTooltip).toBeInTheDocument();
  });
});
