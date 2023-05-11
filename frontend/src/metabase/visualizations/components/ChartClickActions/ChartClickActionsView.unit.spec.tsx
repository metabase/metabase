import React from "react";
import { render, screen } from "__support__/ui";
import DefaultMode from "metabase/modes/components/modes/DefaultMode";
import { checkNotNull } from "metabase/core/utils/types";
import type { RegularClickAction } from "metabase/modes/types";
import Mode from "metabase-lib/Mode";
import { getAdHocQuestion } from "metabase-lib/mocks";
import { QueryMode } from "metabase-lib/queries/drills/types";
import ChartClickActionsView from "./ChartClickActionsView";

describe("ChartClickActionsView", () => {
  it('renders "See this ..." action as the first item', () => {
    setup();

    const sections = screen.getAllByTestId("drill-through-section");

    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0]).toHaveTextContent("See these Orders");
  });
});

function setup(queryMode: QueryMode = DefaultMode as QueryMode) {
  const question = getAdHocQuestion();
  const mode = new Mode(question, queryMode);

  const maybeTable = question.table();

  const questionTable = checkNotNull(maybeTable);

  const clicked = {
    column: questionTable.fields[0].column(),
    value: 42,
    dimensions: [
      {
        column: questionTable.fields[0].column(),
        value: 42,
      },
    ],
  };

  const clickActions = mode.actionsForClick(
    clicked,
    {},
  ) as RegularClickAction[];
  const onClick = jest.fn();

  render(
    <ChartClickActionsView clickActions={clickActions} onClick={onClick} />,
  );

  return {
    mocks: {
      onClick,
    },
  };
}
