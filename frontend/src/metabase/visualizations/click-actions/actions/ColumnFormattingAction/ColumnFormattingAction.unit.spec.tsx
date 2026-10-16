import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import { isPopoverClickAction } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import {
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  ColumnFormattingAction,
  POPOVER_TEST_ID,
} from "./ColumnFormattingAction";

registerVisualizations();

// A text column with no semantic type gets 5 "Display as" options, which makes
// the widget a Select rather than a radio group.
const column = createMockColumn({
  name: "PASSWORD",
  display_name: "Password",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: null,
});

const setup = () => {
  const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
  const card = createAdHocCard();
  const question = new Question(card, metadata);

  const [action] = ColumnFormattingAction({ question, clicked: { column } });
  if (!action || !isPopoverClickAction(action)) {
    throw new Error("Expected a popover click action");
  }

  const FormatPopover = action.popover;

  renderWithProviders(
    <FormatPopover
      series={[createMockSingleSeries(card, { data: { cols: [column] } })]}
      onClick={jest.fn()}
      onChangeCardAndRun={jest.fn()}
      onUpdateVisualizationSettings={jest.fn()}
      onClose={jest.fn()}
    />,
  );

  return { action };
};

describe("ColumnFormattingAction", () => {
  it("should let the popover dropdown overflow so portaled dropdowns are visible", () => {
    const { action } = setup();

    expect(action.popoverProps).toMatchObject({
      styles: { dropdown: { overflow: "visible" } },
    });
  });

  // Regression: the dropdown used to be clipped by the settings scroll container.
  it("should render the Display as dropdown outside of the scroll container", async () => {
    setup();

    const scrollContainer = await screen.findByTestId(POPOVER_TEST_ID);
    await userEvent.click(screen.getByLabelText("Display as"));

    const option = await screen.findByRole("option", { name: "Email link" });
    expect(scrollContainer).not.toContainElement(option);
  });
});
