import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import {
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { FunnelDisqualifier } from "../../analyses/funnel-disqualifiers";
import { createMockEventDefinition, totalAbove } from "../../events/mocks";

import { DisqualifierListWidget } from "./DisqualifierListWidget";

const STEP_COUNT = 3;
const BIG_ORDER = createMockEventDefinition({
  name: "Big order",
  filters: [totalAbove(100)],
});
const HUGE_ORDER = createMockEventDefinition({
  name: "Huge order",
  filters: [totalAbove(1000)],
});

type HarnessProps = {
  initialValue: FunnelDisqualifier[];
  onChange: (value: FunnelDisqualifier[]) => void;
};

/** Holds the value in state, like the settings it's a widget for. */
const Harness = ({ initialValue, onChange }: HarnessProps) => {
  const [value, setValue] = useState(initialValue);

  const handleChange = (newValue: FunnelDisqualifier[]) => {
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <DisqualifierListWidget
      id="disqualifiers"
      value={value}
      table={createOrdersTable()}
      stepCount={STEP_COUNT}
      onChange={handleChange}
    />
  );
};

type SetupOpts = {
  value: FunnelDisqualifier[];
};

const setup = ({ value }: SetupOpts) => {
  const onChange = jest.fn<void, [FunnelDisqualifier[]]>();
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  });

  renderWithProviders(<Harness initialValue={value} onChange={onChange} />, {
    storeInitialState: state,
  });

  return { onChange };
};

const getStepSelects = (name: "First step" | "Last step") =>
  screen.getAllByRole("textbox", { name });

const queryEmptyWell = () =>
  screen.queryByRole("button", { name: "Click to define this" });

describe("DisqualifierListWidget", () => {
  it("starts with an empty event to define", () => {
    setup({ value: [] });

    expect(queryEmptyWell()).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("adds another empty event on request", async () => {
    setup({ value: [{ event: BIG_ORDER, between: null }] });
    expect(queryEmptyWell()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Add another/ }));

    expect(queryEmptyWell()).toBeInTheDocument();
  });

  it("applies a disqualifier between the first and last steps by default", () => {
    setup({ value: [{ event: BIG_ORDER, between: null }] });

    expect(getStepSelects("First step")[0]).toHaveValue("1");
    expect(getStepSelects("Last step")[0]).toHaveValue("3");
  });

  it("applies a disqualifier between two of the steps", async () => {
    const { onChange } = setup({
      value: [
        { event: BIG_ORDER, between: null },
        { event: HUGE_ORDER, between: null },
      ],
    });

    await userEvent.click(getStepSelects("First step")[1]);
    await userEvent.click(screen.getByRole("option", { name: "2" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      { event: BIG_ORDER, between: null },
      { event: HUGE_ORDER, between: { fromStep: 1, toStep: 2 } },
    ]);
  });

  it("moves the last step past a first step picked after it", async () => {
    const { onChange } = setup({
      value: [{ event: BIG_ORDER, between: { fromStep: 0, toStep: 1 } }],
    });

    await userEvent.click(getStepSelects("First step")[0]);
    await userEvent.click(screen.getByRole("option", { name: "2" }));

    expect(onChange).toHaveBeenCalledWith([
      { event: BIG_ORDER, between: { fromStep: 1, toStep: 2 } },
    ]);
  });

  it("ends a range past the last step at it", () => {
    setup({
      value: [{ event: BIG_ORDER, between: { fromStep: 1, toStep: 5 } }],
    });

    expect(getStepSelects("First step")[0]).toHaveValue("2");
    expect(getStepSelects("Last step")[0]).toHaveValue("3");
  });

  it("removes a disqualifier", async () => {
    const { onChange } = setup({
      value: [
        { event: BIG_ORDER, between: null },
        { event: HUGE_ORDER, between: { fromStep: 0, toStep: 1 } },
      ],
    });

    const [firstItem] = screen.getAllByRole("listitem");
    await userEvent.click(
      within(firstItem).getByRole("button", { name: "Remove" }),
    );

    expect(onChange).toHaveBeenCalledWith([
      { event: HUGE_ORDER, between: { fromStep: 0, toStep: 1 } },
    ]);
  });
});
