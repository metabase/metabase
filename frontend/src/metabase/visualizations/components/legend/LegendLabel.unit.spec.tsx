import { fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { Route, Router, createMemoryHistory } from "react-router";

import { screen } from "__support__/ui";

import { LegendLabel } from "./LegendLabel";

describe("LegendLabel", () => {
  const setup = (props: Partial<ComponentProps<typeof LegendLabel>> = {}) => {
    const onClick = jest.fn();
    const onFocus = jest.fn();
    const onMouseEnter = jest.fn();

    const history = createMemoryHistory();
    const component = () => {
      return (
        <LegendLabel
          href="#hello"
          onClick={onClick}
          onFocus={onFocus}
          onMouseEnter={onMouseEnter}
          {...props}
        >
          Test
        </LegendLabel>
      );
    };

    render(
      <Router history={history}>
        <Route path="/" component={component} />
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
