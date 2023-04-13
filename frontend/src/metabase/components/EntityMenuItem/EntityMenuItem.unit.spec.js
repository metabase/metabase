import React from "react";
import { fireEvent, render, screen, getIcon } from "__support__/ui";

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

    expect(getIcon("pencil")).toBeInTheDocument();

    expect(screen.getByText("A pencil icon")).toBeInTheDocument();
  });

  describe("actions and links", () => {
    describe("actions", () => {
      it("should call an action function if an action is provided", () => {
        const spy = jest.fn();

        render(
          <EntityMenuItem title="A pencil icon" icon="pencil" action={spy} />,
        );

        fireEvent.click(getIcon("pencil"));
        expect(spy).toHaveBeenCalledTimes(1);
      });
    });

    describe("links", () => {
      it("should be a link if a link is provided", () => {
        render(
          <EntityMenuItem title="A pencil icon" icon="pencil" link="/derp" />,
        );

        expect(screen.getByTestId("entity-menu-link")).toBeInTheDocument();
      });
    });
  });
});
