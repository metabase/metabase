import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";

import { type PillTab, PillTabNavigation } from "./PillTabNavigation";

const TABS: PillTab[] = [
  { label: "Usage", to: "/monitor/example/usage", icon: "lineandbar" },
  { label: "Events", to: "/monitor/example/events" },
];

function setup({
  tabs = TABS,
  initialRoute = "/monitor/example/usage",
}: { tabs?: PillTab[]; initialRoute?: string } = {}) {
  renderWithProviders(
    <Route path="*" element={<PillTabNavigation tabs={tabs} />} />,
    { withRouter: true, initialRoute },
  );
}

describe("PillTabNavigation", () => {
  it("renders each tab as a real link to its route", () => {
    setup();

    expect(screen.getByRole("link", { name: "Usage" })).toHaveAttribute(
      "href",
      "/monitor/example/usage",
    );
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
      "href",
      "/monitor/example/events",
    );
  });

  it("marks the tab matching the current pathname as the current page", () => {
    setup({ initialRoute: "/monitor/example/events" });

    expect(screen.getByRole("link", { name: "Usage" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("respects an explicit boolean isSelected override", () => {
    setup({
      tabs: [
        { label: "Usage", to: "/monitor/example/usage", isSelected: false },
        { label: "Events", to: "/monitor/example/events", isSelected: true },
      ],
      initialRoute: "/monitor/example/usage",
    });

    expect(screen.getByRole("link", { name: "Usage" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("respects a function isSelected override for pathname prefix matching", () => {
    setup({
      tabs: [
        {
          label: "Broken",
          to: "/monitor/example/broken",
          isSelected: (pathname) => pathname.startsWith("/monitor/example/b"),
        },
        { label: "Unreferenced", to: "/monitor/example/unreferenced" },
      ],
      initialRoute: "/monitor/example/broken/nested",
    });

    expect(screen.getByRole("link", { name: "Broken" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the tab icon when provided", () => {
    setup();

    const tab = screen.getByRole("link", { name: "Usage" });
    expect(
      within(tab).getByRole("img", { name: "lineandbar icon" }),
    ).toBeInTheDocument();
  });

  it("renders an upsell gem for a gated tab", () => {
    setup({
      tabs: [{ label: "Usage", to: "/monitor/example/usage", isGated: true }],
    });

    expect(screen.getByTestId("upsell-gem")).toBeInTheDocument();
  });

  it("does not render an upsell gem for an ungated tab", () => {
    setup();

    expect(screen.queryByTestId("upsell-gem")).not.toBeInTheDocument();
  });
});
