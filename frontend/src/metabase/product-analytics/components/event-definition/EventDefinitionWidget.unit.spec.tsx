import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
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
  type JsEventDefinition,
  getQueryEventDefinition,
  toJsEventDefinition,
} from "../../event-definition";

import { EventDefinitionWidget } from "./EventDefinitionWidget";

const DATABASE = createSampleDatabase();

const STATE = createMockState({
  entities: createMockEntitiesState({ databases: [DATABASE] }),
});

const PROVIDER = selectMetadataProvider(STATE, DATABASE.id);

const TOTAL_ABOVE_100: TestFilterSpec = {
  type: "operator",
  operator: ">",
  args: [
    { type: "column", name: "TOTAL" },
    { type: "literal", value: 100 },
  ],
};

const createStoredEvent = (name: string | null): JsEventDefinition =>
  toJsEventDefinition(
    getQueryEventDefinition(
      Lib.createTestQuery(PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            filters: [TOTAL_ABOVE_100],
          },
        ],
      }),
      name,
    ),
  );

type SetupOpts = {
  value: JsEventDefinition | null;
};

const setup = ({ value }: SetupOpts) => {
  const onChange = jest.fn<void, [JsEventDefinition | null]>();
  renderWithProviders(
    <EventDefinitionWidget
      value={value}
      tableQuery={getTableQuery(PROVIDER, ORDERS_ID)}
      emptyLabel="Any event"
      onChange={onChange}
    />,
    { storeInitialState: STATE },
  );
  const getNextValue = () => checkNotNull(onChange.mock.lastCall)[0];
  return { onChange, getNextValue };
};

describe("EventDefinitionWidget", () => {
  it("shows the empty label without an event, with nothing to remove", () => {
    setup({ value: null });

    expect(screen.getByText("Any event")).toBeInTheDocument();
    expect(screen.queryByLabelText("Remove")).not.toBeInTheDocument();
  });

  it("shows an event's name", () => {
    setup({ value: createStoredEvent("Big orders") });

    expect(screen.getByText("Big orders")).toBeInTheDocument();
  });

  it("names an event without a name after its conditions", () => {
    setup({ value: createStoredEvent(null) });

    expect(screen.getByText("Total is greater than 100")).toBeInTheDocument();
  });

  it("removes the event", async () => {
    const { onChange } = setup({ value: createStoredEvent("Big orders") });

    await userEvent.click(screen.getByLabelText("Remove"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("opens the event in the editor, and stores what's submitted", async () => {
    const value = createStoredEvent(null);
    const { onChange, getNextValue } = setup({ value });

    await userEvent.click(screen.getByText("Total is greater than 100"));
    await userEvent.clear(screen.getByTestId("event-definition-name"));
    await userEvent.type(
      screen.getByTestId("event-definition-name"),
      "Big orders",
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getNextValue()).toEqual({ ...value, name: "Big orders" });
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
  });

  it("stores an unchanged event as it was", async () => {
    const value = createStoredEvent(null);
    const { getNextValue } = setup({ value });

    await userEvent.click(screen.getByText("Total is greater than 100"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(getNextValue()).toEqual(value);
  });

  it("closes the editor without a change when it's cancelled", async () => {
    const { onChange } = setup({ value: null });

    await userEvent.click(screen.getByText("Any event"));
    expect(screen.getByTestId("event-definition-name")).toBeInTheDocument();
    await userEvent.click(document.body);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Any event")).toBeInTheDocument();
  });
});
