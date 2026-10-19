import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import {
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { createMockEventDefinition, totalAbove } from "../../events/mocks";
import type { EventDefinition } from "../../events/types";

import { EventDefinitionListWidget } from "./EventDefinitionListWidget";

const BIG_ORDER = createMockEventDefinition({
  name: "Big order",
  filters: [totalAbove(100)],
});
const HUGE_ORDER = createMockEventDefinition({
  name: "Huge order",
  filters: [totalAbove(1000)],
});

type HarnessProps = {
  initialValue: EventDefinition[];
  onChange: (value: EventDefinition[]) => void;
};

/**
 * Holds the value in state, like the settings it's a widget for, so a change
 * only reaches the widget once React renders it.
 */
const Harness = ({ initialValue, onChange }: HarnessProps) => {
  const [value, setValue] = useState(initialValue);

  const handleChange = (newValue: EventDefinition[]) => {
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <EventDefinitionListWidget
      id="events"
      value={value}
      table={createOrdersTable()}
      onChange={handleChange}
    />
  );
};

type SetupOpts = {
  value: EventDefinition[];
};

const setup = ({ value }: SetupOpts) => {
  const onChange = jest.fn<void, [EventDefinition[]]>();
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  });

  renderWithProviders(<Harness initialValue={value} onChange={onChange} />, {
    storeInitialState: state,
  });

  return { onChange };
};

const getNameInput = () => screen.getByTestId("event-definition-name");

const getListItem = (eventName: string) => {
  const item = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByRole("button", { name: eventName }));
  if (item === undefined) {
    throw new Error(`No list item for ${eventName}`);
  }
  return item;
};

const renameEditedEvent = async (name: string) => {
  await userEvent.clear(getNameInput());
  await userEvent.type(getNameInput(), name);
};

describe("EventDefinitionListWidget", () => {
  it("edits one event at a time", async () => {
    setup({ value: [BIG_ORDER, HUGE_ORDER] });

    await userEvent.click(screen.getByRole("button", { name: "Big order" }));
    expect(screen.getByTestId("event-definition-name")).toHaveValue(
      "Big order",
    );
    expect(screen.getByText("Huge order")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Huge order" }));
    expect(screen.getByTestId("event-definition-name")).toHaveValue(
      "Huge order",
    );
    expect(screen.getByText("Big order")).toBeInTheDocument();
  });

  it("renames an event", async () => {
    const { onChange } = setup({ value: [BIG_ORDER, HUGE_ORDER] });

    await userEvent.click(screen.getByRole("button", { name: "Huge order" }));
    const name = screen.getByTestId("event-definition-name");
    await userEvent.clear(name);
    await userEvent.type(name, "Giant order");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      BIG_ORDER,
      expect.objectContaining({ name: "Giant order" }),
    ]);
    expect(
      screen.queryByTestId("event-definition-name"),
    ).not.toBeInTheDocument();
  });

  it("hides the drag handles while an event is being edited", async () => {
    setup({ value: [BIG_ORDER, HUGE_ORDER] });
    const getHandles = () => screen.getAllByTestId("drag-handle");

    expect(getHandles()).toHaveLength(2);
    getHandles().forEach((handle) => expect(handle).toBeVisible());

    await userEvent.click(screen.getByRole("button", { name: "Big order" }));
    getHandles().forEach((handle) => expect(handle).not.toBeVisible());

    await userEvent.click(document.body);
    getHandles().forEach((handle) => expect(handle).toBeVisible());
  });

  it("removes an event", async () => {
    const { onChange } = setup({ value: [BIG_ORDER, HUGE_ORDER] });

    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(onChange).toHaveBeenCalledWith([HUGE_ORDER]);
  });

  it("needs a name and a condition to add an event, and discards it on a click outside", async () => {
    const { onChange } = setup({ value: [BIG_ORDER] });

    await userEvent.click(screen.getByRole("button", { name: /Add an event/ }));
    await userEvent.type(
      screen.getByTestId("event-definition-name"),
      "Any order",
    );
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();

    await userEvent.click(document.body);

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Add an event/ }),
    ).toBeInTheDocument();
  });

  describe("while an event is being edited", () => {
    it("submits it before editing another", async () => {
      const { onChange } = setup({ value: [BIG_ORDER, HUGE_ORDER] });

      await userEvent.click(screen.getByRole("button", { name: "Big order" }));
      await renameEditedEvent("Giant order");
      await userEvent.click(screen.getByRole("button", { name: "Huge order" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ name: "Giant order" }),
        HUGE_ORDER,
      ]);
      expect(getNameInput()).toHaveValue("Huge order");
    });

    it("submits it before removing another", async () => {
      const { onChange } = setup({ value: [BIG_ORDER, HUGE_ORDER] });

      await userEvent.click(screen.getByRole("button", { name: "Big order" }));
      await renameEditedEvent("Giant order");
      await userEvent.click(
        within(getListItem("Huge order")).getByRole("button", {
          name: "Remove",
        }),
      );

      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ name: "Giant order" }),
      ]);
    });

    it("submits it before adding another", async () => {
      const { onChange } = setup({ value: [BIG_ORDER, HUGE_ORDER] });

      await userEvent.click(screen.getByRole("button", { name: "Big order" }));
      await renameEditedEvent("Giant order");
      await userEvent.click(
        screen.getByRole("button", { name: /Add an event/ }),
      );

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ name: "Giant order" }),
        HUGE_ORDER,
      ]);
      expect(getNameInput()).toHaveValue("");
    });
  });

  describe("while an event is being added", () => {
    it("adds it and starts another when adding again", async () => {
      const { onChange } = setup({ value: [BIG_ORDER] });

      await userEvent.click(
        screen.getByRole("button", { name: /Add an event/ }),
      );
      // The condition picker opens with the editor.
      await userEvent.click(await screen.findByText("Created At"));
      await userEvent.click(await screen.findByText("Today"));
      await userEvent.click(
        screen.getByRole("button", { name: /Add an event/ }),
      );

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith([
        BIG_ORDER,
        expect.objectContaining({ name: "Created At is today" }),
      ]);
      expect(getNameInput()).toHaveValue("");
    });
  });
});
