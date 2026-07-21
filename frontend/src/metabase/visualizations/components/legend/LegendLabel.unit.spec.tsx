import { fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";

import { screen } from "__support__/ui";
import { Route, Router, createMemoryHistory } from "metabase/router";

import { LegendLabel } from "./LegendLabel";

describe("LegendLabel", () => {
  const setup = (props: Partial<ComponentProps<typeof LegendLabel>> = {}) => {
    const onClick = jest.fn();
    const onFocus = jest.fn();
    const onMouseEnter = jest.fn();

    const history = createMemoryHistory();

    render(
      <Router history={history}>
        <Route
          path="/"
          element={
            <LegendLabel
              href="#hello"
              onClick={onClick}
              onFocus={onFocus}
              onMouseEnter={onMouseEnter}
              {...props}
            >
              Test
            </LegendLabel>
          }
        />
      </Router>,
    );

    return { history, onClick, onFocus, onMouseEnter };
  };

  it("should be a link when onClick is defined", () => {
    const { onClick } = setup();

    expect(screen.getByText("Test")).toHaveAttribute("href", "#hello");

    fireEvent.click(screen.getByText("Test"));
    expect(onClick).toHaveBeenCalled();
  });

  it("should not be a link when onClick is not defined", () => {
    const { history } = setup({ onClick: undefined });

    expect(screen.getByText("Test")).not.toHaveAttribute("href");
    fireEvent.click(screen.getByText("Test"));
    expect(history.getCurrentLocation().pathname).toBe("/");
    expect(history.getCurrentLocation().hash).toBe("");
  });
});
