import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import Comment from "metabase/components/Comment";

describe("Comment", () => {
  beforeEach(() => {
    render(<Comment title="Foo" text="bar" />);
  });

  it("should display text", () => {
    screen.getByText("Foo");
    screen.getByText("bar");
  });
});
