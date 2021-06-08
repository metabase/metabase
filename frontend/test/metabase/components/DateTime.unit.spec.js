import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import moment from "moment";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/date";
import MetabaseSettings from "metabase/lib/settings";

import DateTime from "metabase/components/DateTime";

describe("DateTime", () => {
  const TEST_DATE = "2021-06-08T14:40:10";

  function setup(props = {}) {
    const utils = render(
      <DateTime {...props} value={TEST_DATE} data-testid="date-time" />,
    );
    const node = utils.getByTestId("date-time");

    function refresh() {
      utils.rerender(
        <DateTime {...props} value={TEST_DATE} data-testid="date-time" />,
      );
    }

    return {
      ...utils,
      node,
      refresh,
    };
  }

  function mockFormatting(settings) {
    jest
      .spyOn(MetabaseSettings, "formattingOptions")
      .mockImplementation(() => settings);
  }

  function getExpectedFormat({
    date_style = DEFAULT_DATE_STYLE,
    time_style = DEFAULT_TIME_STYLE,
  } = {}) {
    return moment(TEST_DATE).format(`${date_style}, ${time_style}`);
  }

  it("uses default formatting", () => {
    const { node } = setup();
    expect(node).toHaveTextContent(getExpectedFormat());
  });

  it("respects custom date formatting style", () => {
    const STYLE_1 = { date_style: "MMMM D, YYYY" };
    const STYLE_2 = { date_style: "dddd, MMMM D, YYYY" };

    mockFormatting(STYLE_1);
    const { node, refresh } = setup();
    expect(node).toHaveTextContent(getExpectedFormat(STYLE_1));

    mockFormatting(STYLE_2);
    refresh();
    expect(node).toHaveTextContent(getExpectedFormat(STYLE_2));
  });

  it("respects custom time formatting style", () => {
    const STYLE_1 = { time_style: "HH:mm" };
    const STYLE_2 = { time_style: "h:mm A" };

    mockFormatting(STYLE_1);
    const { node, refresh } = setup();
    expect(node).toHaveTextContent(getExpectedFormat(STYLE_1));

    mockFormatting(STYLE_2);
    refresh();
    expect(node).toHaveTextContent(getExpectedFormat(STYLE_2));
  });

  it("respects both date and time formatting style", () => {
    const STYLE_1 = { date_style: "dddd, MMMM D, YYYY", time_style: "HH:mm" };
    const STYLE_2 = { date_style: "dddd, MMMM D, YYYY", time_style: "h:mm A" };

    mockFormatting(STYLE_1);
    const { node, refresh } = setup();
    expect(node).toHaveTextContent(getExpectedFormat(STYLE_1));

    mockFormatting(STYLE_2);
    refresh();
    expect(node).toHaveTextContent(getExpectedFormat(STYLE_2));
  });
});
