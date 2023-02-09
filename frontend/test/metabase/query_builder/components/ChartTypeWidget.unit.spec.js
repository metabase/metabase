import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import ChartTypeWidget from "metabase/query_builder/components/ChartTypeWidget";
import { createMockCard } from "metabase-types/api/mocks";
import Question from "metabase-lib/Question";

const DATA = {
  rows: [
    ["a", 1],
    ["b", 2],
  ],
  cols: [
    { base_type: "type/Text", name: "bar", display_name: "bar" },
    { base_type: "type/Integer", name: "foo", display_name: "foo" },
  ],
};

const setup = (display, props) => {
  const card = createMockCard({ display: display });
  const question = new Question(card);
  render(
    <ChartTypeWidget
      question={question}
      query={question.query()}
      results={{ data: DATA }}
      {...props}
    />,
  );
};

describe("chartypewidget", () => {
  describe("active display type should always be present", () => {
    it("when display is sensible", () => {
      setup("table");

      expect(screen.getByRole("img", { name: /table/i })).toBeInTheDocument();
    });

    it("when display is not sensible", () => {
      setup("gauge");

      expect(screen.getByRole("img", { name: /gauge/i })).toBeInTheDocument();
    });
  });

  it("should open viz picker when you press the chevron", () => {
    const onOpenChartType = jest.fn();

    setup("table", { onOpenChartType });

    fireEvent.click(screen.getByRole("img", { name: /chevrondown/i }));

    expect(onOpenChartType).toHaveBeenCalled();
  });

  it("should update the display when clicking on a viz icon", () => {
    const onUpdateDisplay = jest.fn();

    setup("table", { onUpdateDisplay });

    fireEvent.click(screen.getByRole("img", { name: /line/i }));

    expect(onUpdateDisplay).toHaveBeenCalled();
  });
});
