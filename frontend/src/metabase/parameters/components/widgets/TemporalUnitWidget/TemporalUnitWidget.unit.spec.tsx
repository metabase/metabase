import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { Parameter, TemporalUnit } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { TemporalUnitWidget } from "./TemporalUnitWidget";

interface SetupOpts {
  parameter?: Parameter;
  value?: TemporalUnit;
}

function setup({
  parameter = createMockParameter({ type: "temporal-unit" }),
  value,
}: SetupOpts = {}) {
  const setValue = jest.fn();
  const onClose = jest.fn();

  render(
    <TemporalUnitWidget
      parameter={parameter}
      value={value}
      setValue={setValue}
      onClose={onClose}
    />,
  );

  return { setValue, onClose };
}

describe("TemporalUnitWidget", () => {
  it("should make all temporal units available by default", async () => {
    setup();
    expect(screen.getByRole("option", { name: "Day" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Month" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Year" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Day of month" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: "More…" }));
    expect(screen.getByRole("option", { name: "Year" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Day of month" }),
    ).toBeInTheDocument();
  });

  it("should show only the allowed temporal units when specified", () => {
    setup({
      parameter: createMockParameter({
        type: "temporal-unit",
        temporal_units: ["month", "year"],
      }),
    });

    expect(screen.getByRole("option", { name: "Month" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Year" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Day" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "More…" }),
    ).not.toBeInTheDocument();
  });

  it("should highlight the selected item", () => {
    setup({ value: "month" });
    expect(screen.getByRole("option", { name: "Month" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "Year" })).not.toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("should select a temporal unit and close the popover", async () => {
    const { setValue, onClose } = setup();
    await userEvent.click(screen.getByRole("option", { name: "Month" }));
    expect(setValue).toHaveBeenCalledWith("month");
    expect(onClose).toHaveBeenCalled();
  });
});
