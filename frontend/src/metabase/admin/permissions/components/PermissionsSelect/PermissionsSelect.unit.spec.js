import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";

import { PermissionsSelect } from "./PermissionsSelect";

export const options = [
  {
    label: "Allowed",
    value: "all",
    icon: "check",
    iconColor: "green",
  },
  {
    label: "Limited",
    value: "controlled",
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
    const { queryByText } = render(
      <PermissionsSelect options={options} value="all" />,
    );

    const selected = queryByText("Allowed");
    expect(selected).not.toBeNull();
  });

  it("when clicked shows options except selected", () => {
    const { queryByText, getByRole, getAllByRole } = render(
      <PermissionsSelect options={options} value="all" />,
    );

    const selected = queryByText("Allowed");
    fireEvent.click(selected);

    const optionsList = getByRole("listbox");
    expect(optionsList).not.toBeNull();

    const [limited, noAccess, ...rest] = getAllByRole("option");
    expect(rest).toHaveLength(0);

    expect(limited).toHaveTextContent("Limited");
    expect(noAccess).toHaveTextContent("No access");
  });

  it("selects an option", () => {
    const onChangeMock = jest.fn();
    const { queryByText, getByRole, getAllByRole } = render(
      <PermissionsSelect
        options={options}
        value="all"
        onChange={onChangeMock}
      />,
    );

    const selected = queryByText("Allowed");
    fireEvent.click(selected);

    const optionsList = getByRole("listbox");
    expect(optionsList).not.toBeNull();

    const [limited] = getAllByRole("option");
    fireEvent.click(limited);

    expect(onChangeMock).toHaveBeenCalledWith("controlled", null);
  });

  it("does not show options after click when disabled", () => {
    const { queryByText, queryByRole } = render(
      <PermissionsSelect options={options} value="all" isDisabled={true} />,
    );

    const selected = queryByText("Allowed");
    fireEvent.click(selected);

    const optionsList = queryByRole("listbox");
    expect(optionsList).toBeNull();

    fireEvent.mouseEnter(selected);
  });

  it("shows warning", () => {
    const WARNING = "warning test";
    const { container } = render(
      <PermissionsSelect options={options} value="all" warning={WARNING} />,
    );

    const warning = container.querySelector(".Icon-warning");
    expect(warning).not.toBeNull();

    fireEvent.mouseEnter(warning);
    const warningTooltip = screen.queryByText(WARNING);

    expect(warningTooltip).not.toBeNull();
  });
});
