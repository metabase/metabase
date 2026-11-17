import userEvent from "@testing-library/user-event";

import { getIcon, render, screen } from "__support__/ui";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "metabase-types/api";

import type { PermissionOption } from "../../types";

import { PermissionsSelect } from "./PermissionsSelect";

const options: PermissionOption[] = [
  {
    label: "Allowed",
    value: DataPermissionValue.ALL,
    icon: "check",
    iconColor: "feedback-positive",
  },
  {
    label: "Limited",
    value: DataPermissionValue.CONTROLLED,
    icon: "permissions_limited",
    iconColor: "core-brand",
  },
  {
    label: "No access",
    value: DataPermissionValue.NONE,
    icon: "close",
    iconColor: "feedback-warning",
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

  it("calls onValueClick instead of opening the options when the value is read-only", async () => {
    const onValueClick = jest.fn();
    render(
      <PermissionsSelect
        options={options}
        value={DataPermissionValue.ALL}
        onChange={jest.fn()}
        onValueClick={onValueClick}
        isDisabled={false}
        disabledTooltip={"disabled"}
        permission={DataPermission.VIEW_DATA}
        type={DataPermissionType.ACCESS}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "check icon Allowed" }),
    );

    expect(onValueClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes a read-only value's tooltip when the value is clicked", async () => {
    setupReadOnlyValue();
    const value = screen.getByRole("button", { name: "check icon Allowed" });

    await userEvent.hover(value);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Why: All");
    await userEvent.click(value);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes a read-only value's tooltip on Escape", async () => {
    setupReadOnlyValue();

    await userEvent.hover(
      screen.getByRole("button", { name: "check icon Allowed" }),
    );
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("marks the read-only value being explained as pressed, without its tooltip", async () => {
    setupReadOnlyValue({ isValueSelected: true });
    const value = screen.getByRole("button", { name: "check icon Allowed" });

    expect(value).toHaveAttribute("aria-pressed", "true");
    await userEvent.hover(value);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

function setupReadOnlyValue({ isValueSelected = false } = {}) {
  render(
    <PermissionsSelect
      options={options}
      value={DataPermissionValue.ALL}
      onChange={jest.fn()}
      onValueClick={jest.fn()}
      valueTooltip="Why: All"
      isValueSelected={isValueSelected}
      isDisabled={false}
      disabledTooltip={"disabled"}
      permission={DataPermission.VIEW_DATA}
      type={DataPermissionType.ACCESS}
    />,
  );
}
