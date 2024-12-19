import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ChecklistItemValue } from "../types";

import { setup } from "./setup";

const getItem = (checklistItem: ChecklistItemValue) => {
  return screen.getByTestId(`${checklistItem}-item`);
};

const getItemControl = (label: string) => {
  const labelRegex = new RegExp(label, "i");

  return screen.getByRole("button", {
    name: labelRegex,
  });
};

describe("Onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should have four sections by default for admins", () => {
    setup();

    [
      "Set up your Metabase",
      "Start visualizing your data",
      "Get email updates and alerts",
      "Get the most out of Metabase",
    ].forEach(section => {
      expect(
        screen.getByRole("heading", { name: section }),
      ).toBeInTheDocument();
    });
  });

  it("should not render the 'Set up' section for non-admins", () => {
    setup({ isAdmin: false });

    [
      "Start visualizing your data",
      "Get email updates and alerts",
      "Get the most out of Metabase",
    ].forEach(section => {
      expect(
        screen.getByRole("heading", { name: section }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("heading", { name: "Set up your Metabase" }),
    ).not.toBeInTheDocument();

    expect(screen.queryByTestId("database-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("invite-item")).not.toBeInTheDocument();
  });

  it("'database' accordion item should be open by default for admins", () => {
    const { scrollIntoViewMock } = setup();

    const databaseItem = getItem("database");
    const databaseItemControl = getItemControl("Connect to your database");
    const cta = within(databaseItem).getByRole("link");

    expect(databaseItem).toHaveAttribute("data-active", "true");
    expect(databaseItemControl).toHaveAttribute("data-active", "true");
    expect(databaseItemControl).toHaveAttribute("aria-expanded", "true");

    expect(
      within(databaseItem).getByText(
        "You can connect multiple databases, and query them directly with the query builder or the Native/SQL editor. Metabase connects to more than 15 popular databases.",
      ),
    ).toBeInTheDocument();

    expect(cta).toHaveAttribute("href", "/admin/databases/create");
    expect(
      within(cta).getByRole("button", { name: "Add Database" }),
    ).toBeInTheDocument();

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("'x-ray' accordion item should be open by default for non-admins", () => {
    const { scrollIntoViewMock } = setup({ isAdmin: false });

    const xRayItem = getItem("x-ray");
    const xRayItemControl = getItemControl("Create automatic dashboards");

    expect(xRayItem).toHaveAttribute("data-active", "true");
    expect(xRayItemControl).toHaveAttribute("data-active", "true");
    expect(xRayItemControl).toHaveAttribute("aria-expanded", "true");

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("should be possible to open a different item", async () => {
    const { scrollIntoViewMock } = setup();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    expect(getItem("database")).toHaveAttribute("data-active", "true");
    await userEvent.click(getItemControl("Query with SQL"));
    expect(scrollIntoViewMock).toHaveBeenCalled();

    expect(getItem("database")).not.toHaveAttribute("data-active");
    expect(getItem("sql")).toHaveAttribute("data-active", "true");
  });

  it("should scroll the last remembered item into view on page load", () => {
    const { scrollIntoViewMock } = setup({ openItem: "sql" });

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // closing the item should not trigger `scrollIntoView` again
    userEvent.click(getItemControl("Query with SQL"));
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it("only one item can be expanded at a time", async () => {
    setup();

    const databaseItemControl = getItemControl("Connect to your database");
    const sqlItemControl = getItemControl("Query with SQL");

    expect(databaseItemControl).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(sqlItemControl);

    expect(databaseItemControl).toHaveAttribute("aria-expanded", "false");
    expect(sqlItemControl).toHaveAttribute("aria-expanded", "true");
  });

  it.each<ChecklistItemValue>([
    "x-ray",
    "notebook",
    "sql",
    "dashboard",
    "subscription",
    "alert",
  ])("%s CTA should not be visible to non-admins", item => {
    setup({ isAdmin: false, openItem: item });

    expect(screen.getByTestId(`${item}-item`)).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.queryByTestId(`${item}-cta`)).not.toBeInTheDocument();
  });

  describe("'Set up your Metabase' section", () => {
    it("'add database' item should render properly", () => {
      setup();

      expect(getItemControl("Connect to your database")).toBeInTheDocument();

      const databaseItem = getItem("database");
      const cta = within(databaseItem).getByRole("link");

      expect(cta).toHaveAttribute("href", "/admin/databases/create");
      expect(
        within(cta).getByRole("button", { name: "Add Database" }),
      ).toBeInTheDocument();
    });

    it("'invite people' item should render properly", async () => {
      setup({ openItem: "invite" });

      const inviteItem = getItem("invite");
      // There are two buttons with the same text
      const [controlLabel] = within(inviteItem).getAllByRole("button", {
        name: "Invite people",
      });
      const [primaryCTA, secondaryCTA] =
        within(inviteItem).getAllByRole("link");

      expect(controlLabel).not.toHaveAttribute("href");
      expect(
        within(inviteItem).getByText(
          "Don't be shy with invites. Metabase makes self-service analytics easy.",
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
          name: "Set up Single Sign-on",
        }),
      ).toBeInTheDocument();
    });
  });

  describe("'Start visualizing your data' section", () => {
    it("'x-ray' item should render properly", () => {
      setup({ openItem: "x-ray" });

      expect(getItemControl("Create automatic dashboards")).toBeInTheDocument();
      expect(
        within(getItem("x-ray")).getByText(
          /Hover over a table and click the yellow lightning bolt/,
        ),
      ).toBeInTheDocument();

      const cta = within(getItem("x-ray")).getByRole("link");

      expect(cta).toHaveAttribute("href", "/browse/databases");
      expect(
        within(cta).getByRole("button", { name: "Browse data" }),
      ).toBeInTheDocument();
    });

    it("'x-ray' CTA should not render if x-rays are disabled", () => {
      setup({ openItem: "x-ray", enableXrays: false });
      expect(
        within(getItem("x-ray")).queryByText(
          /Hover over a table and click the yellow lightning bolt/,
        ),
      ).not.toBeInTheDocument();
      expect(
        within(getItem("x-ray")).getByText(
          /You need to enable this feature first./,
        ),
      ).toBeInTheDocument();

      expect(
        within(getItem("x-ray")).queryByTestId("x-ray-cta"),
      ).not.toBeInTheDocument();
    });

    it("copy for disabled x-rays should be slightly different for non-admins", () => {
      setup({ openItem: "x-ray", enableXrays: false, isAdmin: false });
      expect(
        within(getItem("x-ray")).queryByText(
          /Hover over a table and click the yellow lightning bolt/,
        ),
      ).not.toBeInTheDocument();
      expect(
        within(getItem("x-ray")).getByText(
          /An admin needs to enable this feature first./,
        ),
      ).toBeInTheDocument();
    });

    it("'notebook' item should render properly", () => {
      setup({ openItem: "notebook" });

      expect(
        getItemControl("Make an interactive chart with the query builder"),
      ).toBeInTheDocument();

      const cta = within(getItem("notebook")).getByRole("link");

      expect(cta).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/question\/notebook#[a-zA-Z0-9]{20}/),
      );
      expect(
        within(cta).getByRole("button", { name: "New question" }),
      ).toBeInTheDocument();
    });

    it("'sql' item should render properly", () => {
      setup({ openItem: "sql" });

      expect(getItemControl("Query with SQL")).toBeInTheDocument();

      const docsLink = within(getItem("sql")).getByText("SQL templates");

      expect(docsLink).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/questions/native-editor/sql-parameters.html?utm_source=product&utm_medium=docs&utm_campaign=help&utm_content=getting-started&source_plan=oss",
      );

      const cta = within(screen.getByTestId("sql-cta")).getByRole("link");

      expect(cta).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/question#[a-zA-Z0-9]{20}/),
      );
      expect(
        within(cta).getByRole("button", { name: "New native query" }),
      ).toBeInTheDocument();
    });

    it("'dashboard' item should render properly", () => {
      setup({ openItem: "dashboard" });

      expect(
        getItemControl("Create and filter a dashboard"),
      ).toBeInTheDocument();

      const docsLink = within(getItem("dashboard")).getByText(
        "dashboard with tabs",
      );

      expect(docsLink).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/dashboards/introduction.html?utm_source=product&utm_medium=docs&utm_campaign=help&utm_content=getting-started&source_plan=oss#dashboard-tabs",
      );

      const cta = within(screen.getByTestId("dashboard-cta")).getByRole("link");

      expect(cta).toHaveAttribute("href", "/dashboard/1");
      expect(
        within(cta).getByRole("button", { name: "See a sample dashboard" }),
      ).toBeInTheDocument();
    });

    it("should not render CTA for the example dashboard if example dashboard doesn't exist", () => {
      setup({ openItem: "dashboard", hasExampleDashboard: false });

      expect(
        screen.queryByRole("button", { name: "Edit a sample dashboard" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("'Get email updates and alerts' section", () => {
    it("'subscription' item should render properly", () => {
      setup({ openItem: "subscription" });

      expect(
        getItemControl("Subscribe to a dashboard by email or Slack"),
      ).toBeInTheDocument();

      const commsSetup = screen.getByTestId("subscription-communication-setup");

      expect(
        within(commsSetup).getByRole("link", { name: "Set up email" }),
      ).toHaveAttribute("href", "/admin/settings/email/smtp");
      expect(
        within(commsSetup).getByRole("link", { name: "Slack" }),
      ).toHaveAttribute("href", "/admin/settings/notifications");

      const cta = screen.getByTestId("subscription-cta");
      expect(within(cta).getByRole("link")).toHaveAttribute(
        "href",
        "/dashboard/1",
      );
      expect(
        within(cta).getByRole("button", {
          name: "Set up subscriptions for a sample dashboard",
        }),
      ).toBeInTheDocument();
    });

    it("should not render CTA for the example dashboard if example dashboard doesn't exist", () => {
      setup({ openItem: "subscription", hasExampleDashboard: false });

      expect(screen.queryByTestId("subscription-cta")).not.toBeInTheDocument();
    });

    it.each<ChecklistItemValue>(["subscription", "alert"])(
      "should not render %s email and slack setup links for hosted instances",
      item => {
        setup({ openItem: item, isHosted: true });
        expect(
          screen.queryByTestId(`${item}-communication-setup`),
        ).not.toBeInTheDocument();
      },
    );

    it("'alert' item should render properly", () => {
      setup({ openItem: "alert" });

      expect(
        getItemControl("Get alerts when metrics behave unexpectedly"),
      ).toBeInTheDocument();

      const commsSetup = screen.getByTestId("alert-communication-setup");

      expect(
        within(commsSetup).getByRole("link", { name: "Set up email" }),
      ).toHaveAttribute("href", "/admin/settings/email/smtp");
      expect(
        within(commsSetup).getByRole("link", { name: "Slack" }),
      ).toHaveAttribute("href", "/admin/settings/notifications");

      const cta = screen.getByTestId("alert-cta");
      expect(within(cta).getByRole("link")).toHaveAttribute(
        "href",
        "/question/12",
      );
      expect(
        within(cta).getByRole("button", {
          name: "Set up alert for a sample question",
        }),
      ).toBeInTheDocument();
    });

    it("'alert' item docs links", () => {
      setup({ openItem: "alert" });

      const goalDoc = within(getItem("alert")).getByText("Goal line alerts");
      const progressDoc = within(getItem("alert")).getByText(
        "Progress bar alerts",
      );
      const resultDoc = within(getItem("alert")).getByText("Results alerts");

      expect(goalDoc).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/questions/sharing/alerts.html?utm_source=product&utm_medium=docs&utm_campaign=help&utm_content=getting-started&source_plan=oss#goal-line-alerts",
      );
      expect(progressDoc).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/questions/sharing/alerts.html?utm_source=product&utm_medium=docs&utm_campaign=help&utm_content=getting-started&source_plan=oss#progress-bar-alerts",
      );
      expect(resultDoc).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/questions/sharing/alerts.html?utm_source=product&utm_medium=docs&utm_campaign=help&utm_content=getting-started&source_plan=oss#results-alerts",
      );
    });

    it.each<ChecklistItemValue>(["subscription", "alert"])(
      "should not render %s email and Slack setup links for hosted instances",
      i => {
        setup({ openItem: i, isHosted: true });
        expect(
          screen.queryByTestId(`${i}-communication-setup`),
        ).not.toBeInTheDocument();
      },
    );

    it("should not render CTA for the example question if example dashboard doesn't exist", () => {
      setup({ openItem: "subscription", hasExampleDashboard: false });

      expect(screen.queryByTestId("alert-cta")).not.toBeInTheDocument();
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
