import userEvent from "@testing-library/user-event";

import { getIcon, render, screen } from "__support__/ui";

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

  it("when clicked shows options except selected", async () => {
    render(<PermissionsSelect options={options} value="all" />);

    await userEvent.click(screen.getByText("Allowed"));

    const optionsList = await screen.findByRole("listbox");
    expect(optionsList).toBeInTheDocument();

    const [limited, noAccess, ...rest] = screen.getAllByRole("option");
    expect(rest).toEqual([]);

    expect(limited).toHaveTextContent("Limited");
    expect(noAccess).toHaveTextContent("No access");
  });

  it("selects an option", async () => {
    const onChangeMock = jest.fn();
    render(
      <PermissionsSelect
        options={options}
        value="all"
        onChange={onChangeMock}
      />,
    );

    await userEvent.click(screen.getByText("Allowed"));

    const optionsList = await screen.findByRole("listbox");
    expect(optionsList).toBeInTheDocument();

    const [limited] = screen.getAllByRole("option");
    await userEvent.click(limited);

    expect(onChangeMock).toHaveBeenCalledWith(
      DataPermissionValue.CONTROLLED,
      null,
    );
  });

  it("does not show options after click when disabled", async () => {
    render(
      <PermissionsSelect options={options} value="all" isDisabled={true} />,
    );

    await userEvent.click(screen.getByText("Allowed"));

    const optionsList = screen.queryByRole("listbox");
    expect(optionsList).not.toBeInTheDocument();
  });

  it("shows warning", async () => {
    const WARNING = "warning test";
    render(
      <PermissionsSelect options={options} value="all" warning={WARNING} />,
    );

    await userEvent.hover(getIcon("warning"));

    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });
});
