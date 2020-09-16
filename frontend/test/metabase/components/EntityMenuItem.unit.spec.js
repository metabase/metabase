import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { fireEvent, render, screen } from "@testing-library/react";

import EntityMenuItem from "metabase/components/EntityMenuItem";

describe("EntityMenuItem", () => {
  it("should display the proper title and icon", () => {
    render(
      <EntityMenuItem
        title="A pencil icon"
        icon="pencil"
        action={() => ({})}
      />,
    );
    screen.getByRole("img", { name: /pencil icon/i });
    screen.getByText("A pencil icon");
  });

  describe("actions and links", () => {
    describe("actions", () => {
      it("should call an action function if an action is provided", () => {
        const spy = jest.fn();

        render(
          <EntityMenuItem title="A pencil icon" icon="pencil" action={spy} />,
        );

        fireEvent.click(screen.getByRole("img", { name: /pencil icon/i }));
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });

    describe("links", () => {
      it("should be a link if a link is provided", () => {
        const { container } = render(
          <EntityMenuItem title="A pencil icon" icon="pencil" link="/derp" />,
        );

        expect(container.querySelector("a")).toBeInTheDocument();
      });
    });
  });
});
