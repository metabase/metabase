import { renderWithProviders, screen } from "__support__/ui";

import { Tabs, type TabsProps } from "./Tabs";

function setup(props: TabsProps = {}) {
  renderWithProviders(
    <Tabs data-testid="tabs" defaultValue="one" {...props}>
      <Tabs.List>
        <Tabs.Tab value="one">One</Tabs.Tab>
        <Tabs.Tab value="two">Two</Tabs.Tab>
      </Tabs.List>
    </Tabs>,
  );

  return screen.getByTestId("tabs");
}

describe("Tabs", () => {
  describe("size", () => {
    it("defaults to md", () => {
      expect(setup()).toHaveAttribute("data-size", "md");
    });

    it("exposes sm on the root for the pills variant", () => {
      expect(setup({ variant: "pills", size: "sm" })).toHaveAttribute(
        "data-size",
        "sm",
      );
    });

    it("only accepts sm together with the pills variant", () => {
      // @ts-expect-error -- sm is a pills-only size
      const props: TabsProps = { size: "sm" };
      expect(setup(props)).toHaveAttribute("data-size", "sm");
    });
  });
});
