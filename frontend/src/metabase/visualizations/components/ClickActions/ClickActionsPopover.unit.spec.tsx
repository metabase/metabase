import { renderWithProviders, screen } from "__support__/ui";
import type {
  ClickObject,
  RegularClickAction,
} from "metabase/visualizations/types";

import { ClickActionsPopover } from "./ClickActionsPopover";

function setup() {
  const anchor = document.createElement("div");
  document.body.appendChild(anchor);

  const clicked = {
    element: anchor,
    column: { display_name: "Total" },
    value: 42,
  } as unknown as ClickObject;

  const clickActions = [
    {
      name: "test-action",
      title: "Test Action",
      icon: "filter",
      section: "filter",
      buttonType: "horizontal",
      question: () => undefined,
      default: true,
    },
  ] as unknown as RegularClickAction[];

  return renderWithProviders(
    <ClickActionsPopover
      clicked={clicked}
      clickActions={clickActions}
      series={null}
      dispatch={jest.fn() as any}
      onChangeCardAndRun={jest.fn() as any}
      onUpdateVisualizationSettings={jest.fn()}
    />,
  );
}

describe("ClickActionsPopover", () => {
  it("renders the popover when clicked with a connected anchor element", () => {
    setup();
    expect(screen.getByTestId("click-actions-popover")).toBeInTheDocument();
  });

  it("renders click action items in the popover", () => {
    setup();
    expect(
      screen.getByTestId("click-actions-popover-content-for-Total"),
    ).toBeInTheDocument();
  });

  it("does not render when there is no clicked object", () => {
    renderWithProviders(
      <ClickActionsPopover
        clicked={null}
        clickActions={[]}
        series={null}
        dispatch={jest.fn()}
        onChangeCardAndRun={jest.fn()}
        onUpdateVisualizationSettings={jest.fn()}
      />,
    );
    expect(
      screen.queryByTestId("click-actions-popover"),
    ).not.toBeInTheDocument();
  });
});
