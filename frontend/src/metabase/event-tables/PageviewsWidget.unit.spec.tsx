import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { PageviewsWidget } from "./PageviewsWidget";
import { EVERY_EVENT, type PageviewRule } from "./pageviews";

const TABLE = createMockTable({
  fields: [
    createMockField({
      id: 1,
      name: "event_name",
      display_name: "Event name",
      base_type: "type/Text",
    }),
    createMockField({
      id: 2,
      name: "event_type",
      display_name: "Event type",
      base_type: "type/Integer",
    }),
  ],
});

type SetupOpts = {
  value?: PageviewRule | null;
};

const setup = ({ value = null }: SetupOpts = {}) => {
  const onChange = jest.fn<void, [PageviewRule | null]>();
  renderWithProviders(
    <PageviewsWidget
      id="pageviews"
      value={value}
      table={TABLE}
      eventNameColumn="event_name"
      onChange={onChange}
    />,
  );
  return { onChange };
};

const pickMode = async (from: string, to: string) => {
  await userEvent.click(screen.getByDisplayValue(from));
  await userEvent.click(await screen.findByText(to));
};

describe("PageviewsWidget", () => {
  it("makes every event a pageview", async () => {
    const { onChange } = setup();

    await pickMode("None", "Every event");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(EVERY_EVENT);
  });

  it("saves a rule on the event name column once it has a value", async () => {
    const { onChange } = setup();

    await pickMode("None", "Events where a column has a value");

    expect(screen.getByLabelText("Pageview column")).toHaveValue("Event name");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Pageview value"), "page_view");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      type: "column_value",
      column: "event_name",
      value: "page_view",
    });
  });

  it("saves a number for a numeric column", async () => {
    const { onChange } = setup({
      value: { type: "column_value", column: "event_name", value: "pv" },
    });

    await userEvent.click(screen.getByLabelText("Pageview column"));
    await userEvent.click(await screen.findByText("Event type"));
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Pageview value"), "1{enter}");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      type: "column_value",
      column: "event_type",
      value: 1,
    });
  });

  it("clears the value instead of saving it on another column", async () => {
    const { onChange } = setup({
      value: { type: "column_value", column: "event_type", value: 1 },
    });

    await userEvent.click(screen.getByLabelText("Pageview column"));
    await userEvent.click(await screen.findByText("Event name"));

    const valueInput = screen.getByLabelText("Pageview value");
    expect(valueInput).toHaveValue("");
    await userEvent.click(valueInput);
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the rule", async () => {
    const { onChange } = setup({ value: EVERY_EVENT });

    await pickMode("Every event", "None");

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
