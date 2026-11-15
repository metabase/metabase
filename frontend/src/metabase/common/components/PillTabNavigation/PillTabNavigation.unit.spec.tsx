import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";

import { type PillTab, PillTabNavigation } from "./PillTabNavigation";

const TABS: PillTab[] = [
  { label: "Usage", to: "/monitor/example/usage", icon: "lineandbar" },
  { label: "Events", to: "/monitor/example/events" },
];

interface SetupOpts {
  tabs?: PillTab[];
  initialRoute?: string;
}

function setup({
  tabs = TABS,
  initialRoute = "/monitor/example/usage",
}: SetupOpts = {}) {
  renderWithProviders(
    <Route
      path="*"
      element={
        <>
          <PillTabNavigation tabs={tabs} />
          <button>unrelated tab stop</button>
        </>
      }
    />,
    { withRouter: true, initialRoute },
  );
}

describe("PillTabNavigation", () => {
  it("renders a tab with onClick as a button that shows its selection and calls onClick on click and Enter", async () => {
    const onClick = jest.fn<void, []>();
    setup({
      tabs: [{ label: "Failing", onClick, isSelected: true }],
    });

    const tab = screen.getByRole("tab", { name: "Failing" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    await userEvent.click(tab);
    expect(onClick).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("moves focus between tabs with the arrow, Home and End keys", async () => {
    setup({
      tabs: [
        { label: "Usage", to: "/monitor/example/usage" },
        { label: "Events", to: "/monitor/example/events" },
        { label: "Failing", onClick: jest.fn<void, []>() },
      ],
    });
    const usage = screen.getByRole("tab", { name: "Usage" });
    const events = screen.getByRole("tab", { name: "Events" });
    const failing = screen.getByRole("tab", { name: "Failing" });

    await userEvent.tab();
    expect(usage).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(events).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(failing).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(usage).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(failing).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(usage).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(failing).toHaveFocus();
  });

  it.each([
    { modifier: "altKey" },
    { modifier: "ctrlKey" },
    { modifier: "metaKey" },
    { modifier: "shiftKey" },
  ])("leaves $modifier + arrow keys to the browser", ({ modifier }) => {
    setup();
    const usage = screen.getByRole("tab", { name: "Usage" });
    usage.focus();

    const isNotPrevented = fireEvent.keyDown(usage, {
      key: "ArrowRight",
      [modifier]: true,
    });

    expect(isNotPrevented).toBe(true);
    expect(usage).toHaveFocus();
  });

  it("leaves arrow keys to the browser when there is only one tab", () => {
    setup({ tabs: [{ label: "Usage", to: "/monitor/example/usage" }] });
    const usage = screen.getByRole("tab", { name: "Usage" });
    usage.focus();

    expect(fireEvent.keyDown(usage, { key: "ArrowRight" })).toBe(true);
    expect(usage).toHaveFocus();
  });

  it("uses roving tabIndex", async () => {
    setup({ initialRoute: "/monitor/example/events" });
    const events = screen.getByRole("tab", { name: "Events" });
    const nextTabStop = screen.getByRole("button", {
      name: "unrelated tab stop",
    });

    await userEvent.tab();
    expect(events).toHaveFocus();
    await userEvent.tab();
    expect(nextTabStop).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Tab}");
    expect(events).toHaveFocus();
  });

  it("roving tabIndex ignores focus change", async () => {
    setup();
    const usage = screen.getByRole("tab", { name: "Usage" });
    const events = screen.getByRole("tab", { name: "Events" });
    const nextTabStop = screen.getByRole("button", {
      name: "unrelated tab stop",
    });

    await userEvent.tab();
    expect(usage).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(events).toHaveFocus();
    await userEvent.tab();
    expect(nextTabStop).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Tab}");
    expect(usage).toHaveFocus();
  });

  it("shows a resolved zero count without hiding the tab", () => {
    setup({
      tabs: [
        {
          label: "Events",
          to: "/monitor/example/events",
          count: { status: "loaded", value: 0 },
        },
      ],
    });

    expect(
      within(screen.getByRole("tab", { name: "Events" })).getByText("0"),
    ).toBeInTheDocument();
  });

  it("announces a loaded count as the tab's description, keeping the label as its name", () => {
    setup({
      tabs: [
        {
          label: "Failing",
          onClick: jest.fn<void, []>(),
          count: { status: "loaded", value: 3 },
        },
        { label: "Events", to: "/monitor/example/events" },
      ],
    });

    expect(
      screen.getByRole("tab", { name: "Failing" }),
    ).toHaveAccessibleDescription("3");
    expect(
      screen.getByRole("tab", { name: "Events" }),
    ).not.toHaveAccessibleDescription();
  });

  it("formats large counts with digit grouping", () => {
    setup({
      tabs: [
        {
          label: "Events",
          to: "/monitor/example/events",
          count: { status: "loaded", value: 37918 },
        },
      ],
    });

    expect(
      within(screen.getByRole("tab", { name: "Events" })).getByText("37,918"),
    ).toBeInTheDocument();
  });

  it("shows a placeholder while the count loads without blocking navigation", () => {
    setup({
      tabs: [
        {
          label: "Events",
          to: "/monitor/example/events",
          count: { status: "loading" },
        },
      ],
    });

    const tab = screen.getByRole("tab", { name: "Events" });
    expect(tab).toHaveAttribute("href", "/monitor/example/events");
    expect(within(tab).getByTestId("tab-count-skeleton")).toBeInTheDocument();
    expect(tab).not.toHaveAccessibleDescription();
  });

  it("omits a failed count without hiding the tab", () => {
    setup({
      tabs: [
        {
          label: "Events",
          to: "/monitor/example/events",
          count: { status: "error" },
        },
      ],
    });

    const tab = screen.getByRole("tab", { name: "Events" });
    expect(within(tab).queryByText(/\d/)).not.toBeInTheDocument();
    expect(tab).not.toHaveAccessibleDescription();
    expect(
      within(tab).queryByTestId("tab-count-skeleton"),
    ).not.toBeInTheDocument();
  });

  it("renders each tab as a real link to its route", () => {
    setup();

    expect(screen.getByRole("tab", { name: "Usage" })).toHaveAttribute(
      "href",
      "/monitor/example/usage",
    );
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "href",
      "/monitor/example/events",
    );
  });

  it("marks the tab matching the current pathname as the current page", () => {
    setup({ initialRoute: "/monitor/example/events" });

    expect(screen.getByRole("tab", { name: "Usage" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "aria-selected",
      "true",
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

    expect(screen.getByRole("tab", { name: "Usage" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "aria-selected",
      "true",
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

    expect(screen.getByRole("tab", { name: "Broken" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows the tab icon when provided", () => {
    setup();

    const tab = screen.getByRole("tab", { name: "Usage" });
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

  it("shows the tab count after its label", () => {
    setup({
      tabs: [
        { label: "Usage", to: "/monitor/example/usage" },
        {
          label: "Events",
          to: "/monitor/example/events",
          count: { status: "loaded", value: 0 },
        },
      ],
    });

    const tab = screen.getByRole("tab", { name: "Events" });
    expect(within(tab).getByTestId("pill-tab-count")).toHaveTextContent("0");
    expect(
      within(screen.getByRole("tab", { name: "Usage" })).queryByTestId(
        "pill-tab-count",
      ),
    ).not.toBeInTheDocument();
  });
});
