import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import CommentHeader from "metabase/components/CommentHeader";

const MENU_ICON_SELECTOR = ".icon-ellipsis";
const TITLE = "Foo";

describe("CommentHeader", () => {
  let actions;
  let mockFn;
  let container;
  let rerender;
  beforeEach(() => {
    mockFn = jest.fn();
    actions = [
      {
        icon: "alert",
        title: "alert",
        action: () => mockFn(),
      },
    ];
    const { container: _container, rerender: _rerender } = render(
      <CommentHeader title={TITLE} timestamp={1} actions={actions} />,
    );
    container = _container;
    rerender = _rerender;
  });

  it("should display the title", () => {
    screen.getByText(TITLE);
  });

  it("should have an action menu", () => {
    container.querySelector(MENU_ICON_SELECTOR).click();
    screen.getByText("alert").click();
    expect(mockFn).toHaveBeenCalled();
  });

  it("should show the given timestamp in relative time for number", () => {
    screen.getByText(/[0-9]* years ago/);
  });

  it("should show the given timestamp in relative time for string", () => {
    rerender(
      <CommentHeader title={TITLE} timestamp="1900-10-10" actions={actions} />,
    );
    screen.getByText(/[0-9]* years ago/);
  });

  it("should show the given timestamp in relative time for date", () => {
    rerender(
      <CommentHeader
        title={TITLE}
        timestamp={new Date("1900")}
        actions={actions}
      />,
    );
    screen.getByText(/[0-9]* years ago/);
  });

  it("should be able to render without optional props", () => {
    rerender(<CommentHeader title={TITLE} />);
    expect(container.textContent).toEqual(TITLE);
    expect(container.querySelector(MENU_ICON_SELECTOR)).toBe(null);
  });
});
