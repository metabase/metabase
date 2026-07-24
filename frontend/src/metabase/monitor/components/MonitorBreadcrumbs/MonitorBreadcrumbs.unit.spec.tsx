import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { Crumb } from "metabase/common/components/Breadcrumbs";
import { Route } from "metabase/router";

import { MonitorBreadcrumbs } from "./MonitorBreadcrumbs";

function setup(crumbs: Crumb[]) {
  return renderWithProviders(
    <Route path="/" element={<MonitorBreadcrumbs crumbs={crumbs} />} />,
    { withRouter: true },
  );
}

describe("MonitorBreadcrumbs", () => {
  it("renders a labelled breadcrumb nav with decorative separators between crumbs", () => {
    setup([
      ["Conversations", "/conversations"],
      ["Jane Doe", "/conversations?user=1"],
      "Jan 1, 2026",
    ]);

    // Exposed as a labelled navigation landmark.
    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumbs" });

    expect(within(breadcrumbs).getByText("Conversations")).toBeInTheDocument();
    expect(within(breadcrumbs).getByText("Jane Doe")).toBeInTheDocument();
    expect(within(breadcrumbs).getByText("Jan 1, 2026")).toBeInTheDocument();

    // Separators are decorative: not announced as icons (no accessible label)...
    expect(
      within(breadcrumbs).queryByLabelText("chevronright icon"),
    ).not.toBeInTheDocument();
    // ...and hidden from the accessibility tree. 3 crumbs => 2 separators between them.
    expect(
      within(breadcrumbs).getAllByRole("img", { hidden: true }),
    ).toHaveLength(2);
  });

  it("marks the current crumb with aria-current", () => {
    setup([["Conversations", "/conversations"], "Jan 1, 2026"]);

    expect(screen.getByText("Jan 1, 2026")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Conversations")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders non-last crumbs with a URL as links", () => {
    setup([
      ["Conversations", "/conversations"],
      ["Jane Doe", "/conversations?user=1"],
      "Jan 1, 2026",
    ]);

    const conversations = screen.getByRole("link", { name: "Conversations" });
    expect(conversations).toHaveAttribute("href", "/conversations");

    const user = screen.getByRole("link", { name: "Jane Doe" });
    expect(user).toHaveAttribute("href", "/conversations?user=1");
  });

  it("renders the last crumb as non-link current-page text", () => {
    setup([["Conversations", "/conversations"], "Jan 1, 2026"]);

    expect(
      screen.queryByRole("link", { name: "Jan 1, 2026" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2026")).toBeInTheDocument();
  });

  it("invokes the onClick handler for action crumbs", async () => {
    const onClick = jest.fn();
    setup([["Go back", onClick], "Current"]);

    await userEvent.click(screen.getByText("Go back"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ellipsifies long crumb text with a truncation tooltip", async () => {
    const longText = "A very long crumb title that should be truncated";
    setup([["Conversations", "/conversations"], longText]);

    await userEvent.hover(screen.getByText(longText));

    expect(await screen.findByText(longText)).toBeInTheDocument();
  });
});
