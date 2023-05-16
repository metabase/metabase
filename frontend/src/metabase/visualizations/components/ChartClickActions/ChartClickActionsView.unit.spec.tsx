import React from "react";
import { render, screen } from "__support__/ui";
import DefaultMode from "metabase/modes/components/modes/DefaultMode";
import { checkNotNull } from "metabase/core/utils/types";
import type { RegularClickAction } from "metabase/modes/types";
import { REVIEWS, SAMPLE_DATABASE } from "__support__/sample_database_fixture";
import Mode from "metabase-lib/Mode";
import { getAdHocQuestion } from "metabase-lib/mocks";
import { QueryMode } from "metabase-lib/queries/drills/types";
import { ChartClickActionsView } from "./ChartClickActionsView";

describe("ChartClickActionsView", () => {
  it('should render "See this ..." action as the first item', () => {
    setup("CREATED_AT", "2018-05-15T20:25:48.517+03:00");

    const sections = screen.getAllByTestId("drill-through-section");

    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0]).toHaveTextContent("See these Reviews");
  });

  describe("filter section", () => {
    it('should render "Filter by this value" header for numeric column', () => {
      setup("RATING", 5);

      const sections = screen.getAllByTestId("drill-through-section");
      expect(sections[2]).toHaveTextContent("Filter by this value");
    });

    it("should render numeric filters for numeric column", () => {
      setup("RATING", 5);

      const sections = screen.getAllByTestId("drill-through-section");
      expect(sections[2]).toHaveTextContent(">");
      expect(sections[2]).toHaveTextContent("<");
      expect(sections[2]).toHaveTextContent("=");
      expect(sections[2]).toHaveTextContent("≠");
    });

    it('should render "Filter by this text" header for text column', () => {
      setup("REVIEWER", "christ");

      const sections = screen.getAllByTestId("drill-through-section");
      expect(sections[2]).toHaveTextContent("Filter by this text");
    });

    it("should render text filters for text column", () => {
      setup("REVIEWER", "christ");

      const sections = screen.getAllByTestId("drill-through-section");
      expect(sections[2]).toHaveTextContent("Is christ");
      expect(sections[2]).toHaveTextContent("Is not christ");
    });

    it('should render "Filter by this date" header for date column', () => {
      setup("CREATED_AT", "2023-01-01");

      const sections = screen.getAllByTestId("drill-through-section");
      expect(sections[2]).toHaveTextContent("Filter by this date");
    });

    it("should render date filters for date column", () => {
      setup("CREATED_AT", "2023-01-01");

      const sections = screen.getAllByTestId("drill-through-section");
      expect(sections[2]).toHaveTextContent("Before");
      expect(sections[2]).toHaveTextContent("After");
      expect(sections[2]).toHaveTextContent("On");
      expect(sections[2]).toHaveTextContent("Not on");
    });
  });
});

function setup(
  fieldName: string,
  value: string | number,
  queryMode: QueryMode = DefaultMode as QueryMode,
) {
  const question = getAdHocQuestion({
    dataset_query: {
      type: "query",
      database: SAMPLE_DATABASE?.id,
      query: {
        "source-table": REVIEWS.id,
      },
    },
  });
  const mode = new Mode(question, queryMode);

  let table = question.table();
  table = checkNotNull(table);

  let column = table.fields.find(({ name }) => name === fieldName)?.column();

  column = checkNotNull(column);

  const clicked = {
    column: column,
    value: value,
    dimensions: [
      {
        column: column,
        value: value,
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
