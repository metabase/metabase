import userEvent from "@testing-library/user-event";

import { getScrollIntoViewMock, screen, waitFor, within } from "__support__/ui";
import type { ChecklistItemValue } from "metabase/redux/store";

import { setup } from "./setup";

const getItem = (checklistItem: ChecklistItemValue) => {
  return screen.getByTestId(`${checklistItem}-item`);
};

const getItemControl = (label: string) => {
  // Labels can contain regex metacharacters, e.g. "Set up AI (optional)"
  const labelRegex = new RegExp(
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );

  return screen.getByRole("button", {
    name: labelRegex,
  });
};

describe("Onboarding", () => {
  const scrollIntoViewMock = getScrollIntoViewMock();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should have three sections by default for admins", () => {
    setup();

    [
      "Set things up",
      "Explore your data",
      "Get the most out of Metabase",
    ].forEach((section) => {
      expect(
        screen.getByRole("heading", { name: section }),
      ).toBeInTheDocument();
    });
  });

  it("should not render the 'Set things up' section for non-admins", () => {
    setup({ isAdmin: false });

    ["Explore your data", "Get the most out of Metabase"].forEach((section) => {
      expect(
        screen.getByRole("heading", { name: section }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("heading", { name: "Set things up" }),
    ).not.toBeInTheDocument();

    expect(screen.queryByTestId("database-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("invite-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-item")).not.toBeInTheDocument();
  });

  it("'database' accordion item should be open by default for admins", () => {
    setup();

    const databaseItem = getItem("database");
    const databaseItemControl = getItemControl("Connect Metabase to your data");
    const cta = within(databaseItem).getByRole("link");

    expect(databaseItem).toHaveAttribute("data-active", "true");
    expect(databaseItemControl).toHaveAttribute("data-active", "true");
    expect(databaseItemControl).toHaveAttribute("aria-expanded", "true");

    expect(
      within(databaseItem).getByText(
        "Connect one or more databases. You can query these databases directly, either with the query builder or the native SQL editor.",
      ),
    ).toBeInTheDocument();

    expect(cta).toHaveAttribute("href", "/admin/databases/create");
    expect(
      within(cta).getByRole("button", { name: "Add database" }),
    ).toBeInTheDocument();

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("'query' accordion item should be open by default for non-admins", () => {
    setup({ isAdmin: false });

    const queryItem = getItem("query");
    const queryItemControl = getItemControl("Query your data");

    expect(queryItem).toHaveAttribute("data-active", "true");
    expect(queryItemControl).toHaveAttribute("data-active", "true");
    expect(queryItemControl).toHaveAttribute("aria-expanded", "true");

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("should fall back to the default item when the remembered item is hidden", () => {
    setup({ openItem: "ai", aiFeaturesEnabled: false });

    expect(screen.queryByTestId("ai-item")).not.toBeInTheDocument();
    expect(getItem("database")).toHaveAttribute("data-active", "true");
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("should be possible to open a different item", async () => {
    setup();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    expect(getItem("database")).toHaveAttribute("data-active", "true");
    await userEvent.click(getItemControl("Query your data"));
    // The scroll is deferred until the expand animation finishes
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());

    expect(getItem("database")).not.toHaveAttribute("data-active");
    expect(getItem("query")).toHaveAttribute("data-active", "true");
  });

  it("should scroll the last remembered item into view on page load", async () => {
    setup({ openItem: "query" });

    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalledTimes(1));

    // closing the item should not trigger `scrollIntoView` again
    await userEvent.click(getItemControl("Query your data"));
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("only one item can be expanded at a time", async () => {
    setup();

    const databaseItemControl = getItemControl("Connect Metabase to your data");
    const queryItemControl = getItemControl("Query your data");

    expect(databaseItemControl).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(queryItemControl);

    expect(databaseItemControl).toHaveAttribute("aria-expanded", "false");
    expect(queryItemControl).toHaveAttribute("aria-expanded", "true");
  });

  describe("'Set things up' section", () => {
    it("'database' item should render properly", () => {
      setup();

      expect(
        getItemControl("Connect Metabase to your data"),
      ).toBeInTheDocument();

      const databaseItem = getItem("database");
      const cta = within(databaseItem).getByRole("link");

      expect(cta).toHaveAttribute("href", "/admin/databases/create");
      expect(
        within(cta).getByRole("button", { name: "Add database" }),
      ).toBeInTheDocument();
    });

    it("'invite' item should render properly", () => {
      setup({ openItem: "invite" });

      const inviteItem = getItem("invite");
      const controlLabel = getItemControl("Invite people to your Metabase");
      const [primaryCTA, secondaryCTA] =
        within(inviteItem).getAllByRole("link");

      expect(controlLabel).not.toHaveAttribute("href");
      expect(
        within(inviteItem).getByText(
          "You can invite people via email right away, even if you'll go on to set up single sign-on with your identity provider later on.",
        ),
      ).toBeInTheDocument();

      expect(primaryCTA).toHaveAttribute("href", "/admin/people");
      expect(secondaryCTA).toHaveAttribute(
        "href",
        "/admin/settings/authentication",
      );

      expect(
        within(primaryCTA).getByRole("button", {
          name: "Invite people",
        }),
      ).toBeInTheDocument();
      expect(
        within(secondaryCTA).getByRole("button", {
          name: "Set up single sign-on",
        }),
      ).toBeInTheDocument();
    });

    it("'ai' item should render properly", () => {
      setup({ openItem: "ai" });

      expect(getItemControl("Set up AI (optional)")).toBeInTheDocument();

      const aiItem = getItem("ai");
      expect(
        within(aiItem).getByText(/ask Metabot directly in the Metabase app/),
      ).toBeInTheDocument();

      const cta = within(screen.getByTestId("ai-cta")).getByRole("link");

      expect(cta).toHaveAttribute("href", "/admin/metabot/mcp");
      expect(
        within(cta).getByRole("button", { name: "Set up MCP" }),
      ).toBeInTheDocument();
    });

    it("should not render the 'ai' item when AI features are disabled", () => {
      setup({ aiFeaturesEnabled: false });

      expect(screen.queryByTestId("ai-item")).not.toBeInTheDocument();
      expect(screen.getByTestId("database-item")).toBeInTheDocument();
      expect(screen.getByTestId("invite-item")).toBeInTheDocument();
    });
  });

  describe("'Explore your data' section", () => {
    it("'query' item should render properly", () => {
      setup({ openItem: "query" });

      expect(getItemControl("Query your data")).toBeInTheDocument();

      const queryItem = getItem("query");

      ["+ New", "AI exploration", "Question", "Native query"].forEach(
        (highlight) => {
          expect(within(queryItem).getByText(highlight)).toBeInTheDocument();
        },
      );

      expect(screen.queryByTestId("query-cta")).not.toBeInTheDocument();
    });

    it("'dashboard' item should render properly", () => {
      setup({ openItem: "dashboard" });

      expect(getItemControl("Create a dashboard")).toBeInTheDocument();

      const dashboardItem = getItem("dashboard");

      expect(
        within(dashboardItem).getByText(
          /You can present questions, text, and links on a dashboard/,
        ),
      ).toBeInTheDocument();
      expect(
        within(dashboardItem).getByTitle("How to use dashboards?"),
      ).toHaveAttribute("src", expect.stringContaining("FAst1nabBck"));

      expect(screen.queryByTestId("dashboard-cta")).not.toBeInTheDocument();
    });

    it("'alert' item should render properly", () => {
      setup({ openItem: "alert" });

      expect(
        getItemControl("Get notified when data changes"),
      ).toBeInTheDocument();

      const alertItem = getItem("alert");

      expect(within(alertItem).getByText("Alerts")).toBeInTheDocument();
      expect(
        within(alertItem).getByText("Dashboard subscriptions"),
      ).toBeInTheDocument();
      expect(
        within(alertItem).getByTitle("How to create an alert?"),
      ).toHaveAttribute("src", expect.stringContaining("MPw5__mVg58"));

      expect(screen.queryByTestId("alert-cta")).not.toBeInTheDocument();
    });

    it("'data-studio' item should render properly", () => {
      setup({ openItem: "data-studio" });

      expect(
        getItemControl("Build your semantic layer in Data Studio"),
      ).toBeInTheDocument();

      const dataStudioItem = getItem("data-studio");

      expect(
        within(dataStudioItem).getByText(
          /has all the tools you'll need to get your data organized/,
        ),
      ).toBeInTheDocument();

      const cta = within(screen.getByTestId("data-studio-cta")).getByRole(
        "link",
      );

      expect(cta).toHaveAttribute("href", "/data-studio");
      expect(
        within(cta).getByRole("button", { name: "Go to Data studio" }),
      ).toBeInTheDocument();
    });

    it("'data-studio' copy is visible to viewers, but the CTA is not", () => {
      setup({ isAdmin: false, openItem: "data-studio" });

      expect(
        within(getItem("data-studio")).getByText(
          /has all the tools you'll need to get your data organized/,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("data-studio-cta")).not.toBeInTheDocument();
    });

    it("'data-studio' CTA should be visible to non-admin analysts", () => {
      setup({ isAdmin: false, isAnalyst: true, openItem: "data-studio" });

      const cta = within(screen.getByTestId("data-studio-cta")).getByRole(
        "link",
      );

      expect(cta).toHaveAttribute("href", "/data-studio");
    });

    it("'permissions' item should render properly", () => {
      setup({ openItem: "permissions" });

      expect(getItemControl("Set up permissions")).toBeInTheDocument();

      const permissionsItem = getItem("permissions");

      expect(
        within(permissionsItem).getByText(
          /Create groups, set permissions on the groups/,
        ),
      ).toBeInTheDocument();

      const cta = within(screen.getByTestId("permissions-cta")).getByRole(
        "link",
      );

      expect(cta).toHaveAttribute("href", "/admin/permissions");
      expect(
        within(cta).getByRole("button", { name: "Go to Admin" }),
      ).toBeInTheDocument();
    });

    it("'permissions' copy is visible to non-admins, but the CTA is not", () => {
      setup({ isAdmin: false, openItem: "permissions" });

      expect(
        within(getItem("permissions")).getByText(
          /Create groups, set permissions on the groups/,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("permissions-cta")).not.toBeInTheDocument();
    });
  });

  describe("footer", () => {
    it("should render the 'learning' section", () => {
      setup();

      const footer = screen.getByRole("contentinfo");
      const learning = within(footer).getByTestId("learning-section");

      expect(
        within(learning).getByRole("heading", {
          name: "Get the most out of Metabase",
        }),
      ).toBeInTheDocument();
      expect(
        within(learning).getByText(
          /data visualization, modeling, and other data/,
        ),
      ).toBeInTheDocument();
      expect(
        within(learning).getByRole("link", {
          name: "Docs",
        }),
      ).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/?utm_source=product&utm_medium=docs&utm_campaign=help&utm_content=getting-started&source_plan=oss",
      );
      expect(
        within(learning).getByRole("link", { name: "Learn" }),
      ).toHaveAttribute("href", "https://www.metabase.com/learn/");
    });

    it("should not render the premium 'help' section", () => {
      setup();

      const footer = screen.getByRole("contentinfo");
      const helpSection = within(footer).getByTestId("help-section");
      expect(helpSection).toBeInTheDocument();
      expect(within(helpSection).getByRole("link")).toHaveProperty(
        "href",
        "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1",
      );
    });
  });
});
