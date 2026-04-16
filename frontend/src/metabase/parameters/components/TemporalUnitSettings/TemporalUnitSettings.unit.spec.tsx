import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import type { Parameter, TemporalUnit } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { TemporalUnitSettings } from "./TemporalUnitSettings";

interface SetupOpts {
  parameter?: Parameter;
}

function setup({ parameter = createMockParameter() }: SetupOpts = {}) {
  const onChangeTemporalUnits = jest.fn();

  render(
    <TemporalUnitSettings
      parameter={parameter}
      onChangeTemporalUnits={onChangeTemporalUnits}
    />,
  );

  return { onChangeTemporalUnits };
}

describe("TemporalUnitSettings", () => {
  it.each<[string, TemporalUnit[] | undefined]>([
    ["All", undefined],
    ["All", Lib.availableTemporalUnits()],
    ["None", []],
    ["Minute", ["minute"]],
    ["Month, Quarter", ["month", "quarter"]],
    ["Month, Quarter, Day of week", ["month", "quarter", "day-of-week"]],
    ["Day, Month, Quarter, +1", ["day", "month", "quarter", "year"]],
    ["Hour, Day, Month, +2", ["hour", "day", "month", "quarter", "year"]],
  ])("should correctly format %s", async (value, units) => {
    setup({
      parameter: createMockParameter({
        type: "temporal-unit",
        temporal_units: units,
      }),
    });

    expect(await screen.findByText(value)).toBeInTheDocument();
  });

  it("should select a unit and preserve the unit order", async () => {
    const { onChangeTemporalUnits } = setup({
      parameter: createMockParameter({
        type: "temporal-unit",
        temporal_units: ["day", "year"],
      }),
    });
    await userEvent.click(await screen.findByText("Day, Year"));
    await userEvent.click(await screen.findByLabelText("Month"));
    expect(onChangeTemporalUnits).toHaveBeenCalledWith([
      "day",
      "month",
      "year",
    ]);
  });

  it("should deselect a unit and preserve the unit order", async () => {
    const { onChangeTemporalUnits } = setup({
      parameter: createMockParameter({
        type: "temporal-unit",
        temporal_units: ["day", "month", "quarter", "year"],
      }),
    });
    await userEvent.click(await screen.findByText("Day, Month, Quarter, +1"));
    await userEvent.click(await screen.findByLabelText("Quarter"));
    expect(onChangeTemporalUnits).toHaveBeenCalledWith([
      "day",
      "month",
      "year",
    ]);
  });

  it("should select all the units when only 1 was selected", async () => {
    const { onChangeTemporalUnits } = setup({
      parameter: createMockParameter({
        type: "temporal-unit",
        temporal_units: ["minute"],
      }),
    });
    await userEvent.click(await screen.findByText("Minute"));
    await userEvent.click(await screen.findByLabelText("Select all"));
    expect(onChangeTemporalUnits).toHaveBeenCalledWith(
      Lib.availableTemporalUnits(),
    );
  });

  it("should select all the units when none was selected", async () => {
    const { onChangeTemporalUnits } = setup({
      parameter: createMockParameter({
        type: "temporal-unit",
        temporal_units: [],
      }),
    });
    await userEvent.click(await screen.findByText("None"));
    await userEvent.click(await screen.findByLabelText("Select all"));
    expect(onChangeTemporalUnits).toHaveBeenCalledWith(
      Lib.availableTemporalUnits(),
    );
  });

  it("should select none when deselecting all the units", async () => {
    const { onChangeTemporalUnits } = setup({
      parameter: createMockParameter({
        type: "temporal-unit",
        temporal_units: Lib.availableTemporalUnits(),
      }),
    });
    await userEvent.click(await screen.findByText("All"));
    await userEvent.click(await screen.findByLabelText("Select all"));
    expect(onChangeTemporalUnits).toHaveBeenCalledWith([]);
  });
});
