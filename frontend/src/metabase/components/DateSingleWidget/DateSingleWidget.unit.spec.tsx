import { render, screen } from "@testing-library/react";

import { DateSingleWidget } from "./DateSingleWidget";

describe("DateSingleWidget", () => {
  it("should render correctly", () => {
    render(
      <DateSingleWidget
        value={"2022-05-17"}
        setValue={jest.fn()}
        onClose={jest.fn()}
      ></DateSingleWidget>,
    );
    expect(screen.getByRole("textbox")).toHaveValue("05/17/2022");
    expect(screen.getByText("May 2022")).toBeInTheDocument();
  });
});
