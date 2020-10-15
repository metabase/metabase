import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import Button from "metabase/components/Button";

describe("Button", () => {
  const title = "Clickity click";

  it("should render correctly", () => {
    render(<Button>{title}</Button>);

    // this is why `getByRole()` is so handy and preferred by RTL creators
    // name is derived from text content: https://www.w3.org/TR/wai-aria-practices-1.1/#naming_techniques
    screen.getByRole("button", { name: title });
  });

  it("should render correctly with an icon", () => {
    render(<Button icon="star">{title}</Button>);

    screen.getByRole("img", { name: "star icon" });
  });

  it("should render a primary button given the primary prop", () => {
    render(<Button primary>{title}</Button>);

    expect(screen.getByRole("button")).toHaveClass("Button--primary");
  });
});
