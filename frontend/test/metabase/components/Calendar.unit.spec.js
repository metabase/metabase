import React from "react";
import renderer from "react-test-renderer";
import moment from "moment";
import mockDate from "mockdate";
import { render, screen, fireEvent } from "@testing-library/react";

import Calendar from "metabase/components/Calendar";

describe("Calendar", () => {
  afterEach(() => {
    mockDate.reset();
  });

  it("should render correctly", () => {
    // set the system clock to the snapshot's current date
    mockDate.set("2018-01-12T12:00:00Z", 0);
    const tree = renderer
      .create(<Calendar selected={moment("2018-01-01")} onChange={() => {}} />)
      .toJSON();
    expect(tree).toMatchSnapshot();
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
