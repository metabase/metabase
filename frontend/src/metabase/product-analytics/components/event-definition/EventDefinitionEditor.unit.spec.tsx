import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { selectMetadataProvider } from "metabase/metadata-store";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type { TestFilterSpec } from "metabase-types/api";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getTableQuery } from "../../base-query";
import {
  type EventDefinition,
  getEventQuery,
  getQueryEventDefinition,
} from "../../event-definition";

import { EventDefinitionEditor } from "./EventDefinitionEditor";

const DATABASE = createSampleDatabase();

const STATE = createMockState({
  entities: createMockEntitiesState({ databases: [DATABASE] }),
});

const PROVIDER = selectMetadataProvider(STATE, DATABASE.id);

const TABLE_QUERY = getTableQuery(PROVIDER, ORDERS_ID);

const TOTAL_NAME = "Total is greater than 100";
const DISCOUNT_NAME = "Discount is less than 5";

const TOTAL_ABOVE_100: TestFilterSpec = {
  type: "operator",
  operator: ">",
  args: [
    { type: "column", name: "TOTAL" },
    { type: "literal", value: 100 },
  ],
};

const DISCOUNT_BELOW_5: TestFilterSpec = {
  type: "operator",
  operator: "<",
  args: [
    { type: "column", name: "DISCOUNT" },
    { type: "literal", value: 5 },
  ],
};

const createEvent = (
  name: string | null,
  filters: TestFilterSpec[] = [TOTAL_ABOVE_100, DISCOUNT_BELOW_5],
): EventDefinition =>
  getQueryEventDefinition(
    Lib.createTestQuery(PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID }, filters }],
    }),
    name,
  );

type SetupOpts = {
  value: EventDefinition | null;
};

const setup = ({ value }: SetupOpts) => {
  const onCancel = jest.fn<void, []>();
  const onSubmit = jest.fn<void, [EventDefinition]>();
  renderWithProviders(
    <EventDefinitionEditor
      value={value}
      tableQuery={TABLE_QUERY}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />,
    { storeInitialState: STATE },
  );
  const getSubmitted = () => checkNotNull(onSubmit.mock.lastCall)[0];
  return { onCancel, onSubmit, getSubmitted };
};

const getName = () => screen.getByTestId("event-definition-name");

const getConditionNames = ({ conditions }: EventDefinition) => {
  const query = getEventQuery(TABLE_QUERY, { conditions });
  return Lib.filters(query, -1).map(
    (filter) => Lib.displayInfo(query, -1, filter).displayName,
  );
};

const removeCondition = async (name: string) => {
  const pill = screen
    .getAllByTestId("filter-pill")
    .find((pill) => pill.textContent === name);
  await userEvent.click(within(checkNotNull(pill)).getByLabelText("Remove"));
};

describe("EventDefinitionEditor", () => {
  it("names an event after its conditions, without storing the name", async () => {
    const { onSubmit, getSubmitted } = setup({ value: createEvent(null) });
    expect(getName()).toHaveValue(`${TOTAL_NAME} and ${DISCOUNT_NAME}`);

    await removeCondition(DISCOUNT_NAME);
    expect(getName()).toHaveValue(TOTAL_NAME);
    // Visiting the name without typing doesn't make it a typed name.
    await userEvent.click(getName());
    await userEvent.tab();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(getSubmitted().name).toBeNull();
    expect(getConditionNames(getSubmitted())).toEqual([TOTAL_NAME]);
  });

  it("keeps a typed name when the conditions change", async () => {
    const { getSubmitted } = setup({ value: createEvent("Big orders") });

    await removeCondition(DISCOUNT_NAME);
    expect(getName()).toHaveValue("Big orders");

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(getSubmitted().name).toBe("Big orders");
  });

  it("restores the name when it's cleared", async () => {
    setup({ value: createEvent("Big orders") });

    await userEvent.clear(getName());
    await userEvent.tab();

    expect(getName()).toHaveValue("Big orders");
  });

  it("opens the condition picker for a new event, and can't be submitted until it has a condition", async () => {
    const { onSubmit, getSubmitted } = setup({ value: null });

    expect(await screen.findByText("Total")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
    await userEvent.type(getName(), "Big orders{enter}");
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Add a condition" }),
    );
    await userEvent.click(await screen.findByText("Total"));
    await userEvent.click(screen.getByText("Between"));
    await userEvent.click(screen.getByText("Greater than"));
    await userEvent.type(screen.getByPlaceholderText("Enter a number"), "100");
    await userEvent.click(screen.getByText("Add filter"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(getSubmitted().name).toBe("Big orders");
    expect(getConditionNames(getSubmitted())).toEqual([TOTAL_NAME]);
  });

  it("submits the typed name on Enter", async () => {
    const { onSubmit, getSubmitted } = setup({ value: createEvent(null) });

    await userEvent.clear(getName());
    await userEvent.type(getName(), "Big orders{enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(getSubmitted().name).toBe("Big orders");
  });

  it("submits the typed name on a click outside", async () => {
    const { onSubmit, getSubmitted } = setup({ value: createEvent(null) });

    await userEvent.clear(getName());
    await userEvent.type(getName(), "Big orders");
    await userEvent.click(document.body);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(getSubmitted().name).toBe("Big orders");
  });

  it("isn't submitted or cancelled by a click in a condition picker", async () => {
    const { onCancel, onSubmit } = setup({ value: createEvent(null) });

    await userEvent.click(
      screen.getByRole("button", { name: "Add a condition" }),
    );
    await userEvent.click(await screen.findByText("Total"));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is cancelled by a click outside without conditions", async () => {
    const { onCancel, onSubmit } = setup({ value: null });

    await userEvent.type(getName(), "Big orders");
    await userEvent.click(document.body);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
