import React from "react";
import moment from "moment-timezone";
import mockDate from "mockdate";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

    expect(screen.getByText("January 2018")).toBeInTheDocument();

    userEvent.click(PREVIOUS);
    expect(screen.getByText("December 2017")).toBeInTheDocument();

    userEvent.click(NEXT);
    userEvent.click(NEXT);
    expect(screen.getByText("February 2018")).toBeInTheDocument();
  });
});
