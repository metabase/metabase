import userEvent from "@testing-library/user-event";

import { fireEvent, getIcon, render, screen } from "__support__/ui";
import { delay } from "__support__/utils";
import { EntityMenuItem } from "metabase/common/components/EntityMenuItem";

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

      it("should show tooltip when tooltip prop is provided", async () => {
        render(
          <EntityMenuItem
            title="Link with tooltip"
            icon="pencil"
            link="https://example.com"
            externalLink
            tooltip="Tooltip text"
          />,
        );

        await userEvent.hover(await screen.findByText("Link with tooltip"));
        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveTextContent("Tooltip text");
      });

      it("should not show tooltip when tooltip prop is not provided", async () => {
        render(
          <EntityMenuItem
            title="Link without tooltip"
            icon="pencil"
            link="https://example.com"
            externalLink
          />,
        );

        await userEvent.hover(await screen.findByText("Link without tooltip"));
        // Wait enough time for the tooltip to appear if it was going to appear
        await delay(100);
        const tooltip = screen.queryByRole("tooltip");
        expect(tooltip).not.toBeInTheDocument();
      });
    });

    it("should not render if both action and link props are present", () => {
      render(
        <div data-testid="container">
          <EntityMenuItem
            title="A pencil icon"
            icon="pencil"
            link="/derp"
            action={() => ({})}
          />
        </div>,
      );

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });

    it("should not render if neither action nor link props are present", () => {
      render(
        <div data-testid="container">
          <EntityMenuItem title="A pencil icon" icon="pencil" />
        </div>,
      );

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });
});
