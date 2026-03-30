import userEvent from "@testing-library/user-event";

import { getIcon, render, screen } from "__support__/ui";

import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
  type PermissionOption,
} from "../../types";

import { PermissionsSelect } from "./PermissionsSelect";

const options: PermissionOption[] = [
  {
    label: "Allowed",
    value: DataPermissionValue.ALL,
    icon: "check",
    iconColor: "success",
  },
  {
    label: "Limited",
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconColor: "brand",
  },
  {
    label: "No access",
    value: DataPermissionValue.NONE,
    icon: "close",
    iconColor: "warning",
  },
];

describe("PermissionSelect", () => {
  it("shows selected option", () => {
    render(
      <PermissionsSelect
        options={options}
        value={DataPermissionValue.ALL}
        onChange={jest.fn()}
        isDisabled={false}
        disabledTooltip={"disabled"}
        permission={DataPermission.VIEW_DATA}
        type={DataPermissionType.ACCESS}
      />,
    );
    expect(screen.getByText("Allowed")).toBeInTheDocument();
  });

  it("when clicked shows options except selected", async () => {
    render(
      <PermissionsSelect
        options={options}
        value={DataPermissionValue.ALL}
        onChange={jest.fn()}
        isDisabled={false}
        disabledTooltip={"disabled"}
        permission={DataPermission.VIEW_DATA}
        type={DataPermissionType.ACCESS}
      />,
    );

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
        value={DataPermissionValue.ALL}
        onChange={onChangeMock}
        isDisabled={false}
        disabledTooltip={"disabled"}
        permission={DataPermission.VIEW_DATA}
        type={DataPermissionType.ACCESS}
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
      <PermissionsSelect
        options={options}
        value={DataPermissionValue.ALL}
        isDisabled={true}
        onChange={jest.fn()}
        disabledTooltip={"disabled"}
        permission={DataPermission.VIEW_DATA}
        type={DataPermissionType.ACCESS}
      />,
    );

    await userEvent.click(screen.getByText("Allowed"));

    const optionsList = screen.queryByRole("listbox");
    expect(optionsList).not.toBeInTheDocument();
  });

  it("shows warning", async () => {
    const WARNING = "warning test";
    render(
      <PermissionsSelect
        options={options}
        value={DataPermissionValue.ALL}
        warning={WARNING}
        onChange={jest.fn()}
        isDisabled={false}
        disabledTooltip={"disabled"}
        permission={DataPermission.VIEW_DATA}
        type={DataPermissionType.ACCESS}
      />,
    );

    await userEvent.hover(getIcon("warning"));

    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });
});
