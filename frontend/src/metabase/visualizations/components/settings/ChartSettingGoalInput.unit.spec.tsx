import userEvent from "@testing-library/user-event";

import { setupCardEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockField,
} from "metabase-types/api/mocks";

import {
  ChartSettingGoalInput,
  type ChartSettingGoalInputProps,
} from "./ChartSettingGoalInput";

registerVisualizations();

const COLUMNS = [
  createMockColumn({
    name: "value",
    display_name: "Value",
    base_type: "type/Integer",
  }),
  createMockColumn({
    name: "goal",
    display_name: "Goal",
    base_type: "type/Integer",
  }),
];

const setup = (props: Partial<ChartSettingGoalInputProps> = {}) => {
  const onChange = jest.fn();
  renderWithProviders(
    <ChartSettingGoalInput
      id="goal-input"
      value={0}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
};

describe("ChartSettingGoalInput", () => {
  it("renders a numeric input with no menu when there are no columns or question references", () => {
    setup({ value: 42 });

    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /chevrondown/ }),
    ).not.toBeInTheDocument();
  });

  it("lets you pick a column from the same question via a submenu", async () => {
    const { onChange } = setup({ value: 0, columns: COLUMNS });

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /this question/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Goal" }),
    );

    expect(onChange).toHaveBeenCalledWith("goal");
  });

  it("opens on the self submenu with the selected column checked when editing a column reference", async () => {
    setup({ value: "goal", columns: COLUMNS });

    await openMenu();

    // starts on the submenu (Back is present, root items are not)
    expect(screen.getByRole("menuitem", { name: /Back/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Custom value" }),
    ).not.toBeInTheDocument();

    const selected = screen.getByRole("menuitem", { name: /Goal/ });
    expect(
      within(selected).getByRole("img", { name: /check/ }),
    ).toBeInTheDocument();
  });

  it("lets you switch back to a custom value", async () => {
    const { onChange } = setup({ value: "goal", columns: COLUMNS });

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Back/ }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Custom value" }),
    );

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("hides 'from this question' when there are no numeric columns", async () => {
    setup({ value: 0, columns: [], allowQuestionReference: true });

    await openMenu();

    expect(
      screen.queryByRole("menuitem", { name: /this question/ }),
    ).not.toBeInTheDocument();
  });

  it("hides 'from another question' unless allowed", async () => {
    setup({ value: 0, columns: COLUMNS });

    await openMenu();

    expect(
      screen.queryByRole("menuitem", { name: /another question/ }),
    ).not.toBeInTheDocument();
  });

  it("offers 'from another question' when allowed", async () => {
    setup({ value: 0, columns: COLUMNS, allowQuestionReference: true });

    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /another question/ }),
    ).toBeInTheDocument();
  });

  it("lets you pick a column from an already-referenced question", async () => {
    const card = createMockCard({
      id: 5,
      name: "Orders",
      display: "gauge",
      result_metadata: [
        createMockField({
          name: "total",
          display_name: "Total sum",
          base_type: "type/Integer",
        }),
        createMockField({
          name: "avg",
          display_name: "Average",
          base_type: "type/Integer",
        }),
      ],
    });
    setupCardEndpoints(card);

    const { onChange } = setup({
      value: { card_id: 5, column: "total" },
      allowQuestionReference: true,
    });

    // the column name is shown as the value (card name is in the tooltip)
    expect(await screen.findByDisplayValue("Total sum")).toBeInTheDocument();
    // with an icon based on the referenced card's viz type
    expect(
      await screen.findByRole("img", { name: /gauge/ }),
    ).toBeInTheDocument();

    await userEvent.hover(screen.getByDisplayValue("Total sum"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Orders · Total sum",
    );

    await openMenu();
    const selected = await screen.findByRole("menuitem", { name: /Total sum/ });
    expect(
      within(selected).getByRole("img", { name: /check/ }),
    ).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Average" }),
    );

    expect(onChange).toHaveBeenCalledWith({ card_id: 5, column: "avg" });
  });
});

async function openMenu() {
  await userEvent.click(screen.getByRole("img", { name: /chevrondown/ }));
}
