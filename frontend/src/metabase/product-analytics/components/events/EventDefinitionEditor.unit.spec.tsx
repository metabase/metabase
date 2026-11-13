import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import {
  ORDERS_QUERY,
  createMockEventDefinition,
  discountBelow,
  totalAbove,
} from "../../events/mocks";
import type { EventDefinition } from "../../events/types";

import { EventDefinitionEditor } from "./EventDefinitionEditor";

const TOTAL_NAME = "Total is greater than 100";
const DISCOUNT_NAME = "Discount is less than 5";
const FILTERS = [totalAbove(100), discountBelow(5)];

type SetupOpts = {
  value: EventDefinition | null;
};

const setup = ({ value }: SetupOpts) => {
  const onCancel = jest.fn<void, []>();
  const onSubmit = jest.fn<void, [EventDefinition]>();
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  });

  renderWithProviders(
    <EventDefinitionEditor
      value={value}
      tableQuery={ORDERS_QUERY}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />,
    { storeInitialState: state },
  );

  return { onCancel, onSubmit };
};

const getName = () => screen.getByTestId("event-definition-name");

const removeCondition = (name: string) =>
  userEvent.click(
    within(
      screen.getByText(name, { selector: "[data-testid=filter-pill]" }),
    ).getByRole("button", { name: "Remove" }),
  );

describe("EventDefinitionEditor", () => {
  it("names an event after its conditions", async () => {
    const { onSubmit } = setup({
      value: createMockEventDefinition({
        name: `${TOTAL_NAME} and ${DISCOUNT_NAME}`,
        filters: FILTERS,
      }),
    });

    await removeCondition(DISCOUNT_NAME);
    expect(getName()).toHaveValue(TOTAL_NAME);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: TOTAL_NAME }),
    );
  });

  it("can't be submitted with only a name", async () => {
    const { onSubmit } = setup({ value: null });
    await userEvent.type(getName(), "Big order");
    await userEvent.tab();

    expect(getName()).toHaveValue("Big order");
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();

    await userEvent.type(getName(), "{enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps a custom name when a condition is removed", async () => {
    setup({
      value: createMockEventDefinition({ name: "Big order", filters: FILTERS }),
    });

    await removeCondition(DISCOUNT_NAME);

    expect(getName()).toHaveValue("Big order");
  });

  it("restores the name when it's cleared", async () => {
    const { onSubmit } = setup({
      value: createMockEventDefinition({ name: "Big order", filters: FILTERS }),
    });

    await userEvent.clear(getName());
    await userEvent.tab();
    expect(getName()).toHaveValue("Big order");

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Big order" }),
    );
  });

  it("can't be submitted once its last condition is removed", async () => {
    const { onSubmit } = setup({
      value: createMockEventDefinition({
        name: TOTAL_NAME,
        filters: [totalAbove(100)],
      }),
    });

    await removeCondition(TOTAL_NAME);

    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();

    await userEvent.type(getName(), "{enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the typed name on Enter", async () => {
    const { onSubmit } = setup({
      value: createMockEventDefinition({ name: "Big order", filters: FILTERS }),
    });

    await userEvent.clear(getName());
    await userEvent.type(getName(), "Huge order{enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Huge order" }),
    );
  });

  it("submits the typed name on a click outside", async () => {
    const { onSubmit } = setup({
      value: createMockEventDefinition({ name: "Big order", filters: FILTERS }),
    });

    await userEvent.clear(getName());
    await userEvent.type(getName(), "Huge order");
    await userEvent.click(document.body);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Huge order" }),
    );
  });

  it("isn't submitted or cancelled by a click inside a condition picker", async () => {
    const { onCancel, onSubmit } = setup({
      value: createMockEventDefinition({ name: "Big order", filters: FILTERS }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Add a condition/ }),
    );
    await userEvent.click(await screen.findByText("Total"));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is cancelled by a click outside without conditions", async () => {
    const { onCancel, onSubmit } = setup({ value: null });

    await userEvent.type(getName(), "Big order");
    await userEvent.click(document.body);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("isn't submitted by Enter without conditions", async () => {
    const { onCancel, onSubmit } = setup({ value: null });

    await userEvent.type(getName(), "Big order{enter}");

    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
