import React from "react";

import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import { ClampedDescription } from "metabase/query_builder/components/ClampedDescription";

describe("ClampedDescription", () => {
  describe("when rendered with no description", () => {
    it("should render a button to add a description", () => {
      const onEdit = jest.fn();
      render(<ClampedDescription onEdit={onEdit} />);
      const button = screen.getByText("Add a description");

      button.click();
      expect(onEdit).toHaveBeenCalled();
    });
  });

  describe("when rendered with a description", () => {
    it("should render the description", () => {
      render(<ClampedDescription description="foo" onEdit={() => {}} />);
      expect(() => screen.getByText("Add a description")).toThrow();
      screen.getByText("foo");
    });
  });
});
