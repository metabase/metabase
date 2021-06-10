import React from "react";
import moment from "moment";
import mockDate from "mockdate";
import { render, screen, fireEvent } from "@testing-library/react";

import Calendar from "metabase/components/Calendar";

describe("Calendar", () => {
  afterEach(() => {
    mockDate.reset();
  });

  it("should switch months correctly", () => {
    mockDate.set("2018-01-12T12:00:00Z", 0);
    render(<Calendar selected={moment("2018-01-01")} onChange={() => {}} />);

    const PREVIOUS = screen.getByRole("img", { name: /chevronleft icon/i });
    const NEXT = screen.getByRole("img", { name: /chevronright icon/i });

    screen.getByText("January 2018");
    fireEvent.click(PREVIOUS);
    screen.getByText("December 2017");
    fireEvent.click(NEXT);
    fireEvent.click(NEXT);
    screen.getByText("February 2018");
  });
});
