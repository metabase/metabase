import React from "react";
import { render, screen } from "@testing-library/react";

import { ClampedDescription } from "metabase/query_builder/components/ClampedDescription";

describe("ClampedDescription", () => {
  describe("when rendered with no description and an edit callback", () => {
    it("should render a button to add a description", () => {
      const onEdit = jest.fn();
      render(<ClampedDescription onEdit={onEdit} />);
      const button = screen.getByText("Add a description");

      button.click();
      expect(onEdit).toHaveBeenCalled();
    });
  });

  describe("when rendered with no description and no edit callback", () => {
    it("should render nothing", () => {
      render(<ClampedDescription />);

      expect(() => screen.getByText("Add a description")).toThrow();
    });
  });

  describe("when rendered with a description", () => {
    it("should render the description", () => {
      render(
        <ClampedDescription description="foo" onEdit={() => {}} canWrite />,
      );
      expect(() => screen.getByText("Add a description")).toThrow();
      screen.getByText("foo");
    });
  });
});
