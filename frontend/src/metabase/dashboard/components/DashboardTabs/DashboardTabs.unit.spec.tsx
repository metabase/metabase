import userEvent from "@testing-library/user-event";

import { Route } from "react-router";
import { renderWithProviders, screen, fireEvent } from "__support__/ui";
import { DashboardState, State } from "metabase-types/store";
import { DashboardOrderedTab } from "metabase-types/api";

import { getDefaultTab, resetTempTabId } from "metabase/dashboard/actions";

import { INPUT_WRAPPER_TEST_ID } from "metabase/core/components/TabButton";
import { DashboardTabs } from "./DashboardTabs";
import { TEST_DASHBOARD_STATE } from "./test-utils";
import { useDashboardTabs } from "./use-dashboard-tabs";
import { getSlug } from "./use-sync-url-slug";

function setup({
  tabs,
  slug = undefined,
  isEditing = true,
}: {
  tabs?: DashboardOrderedTab[];
  slug?: string | undefined;
  isEditing?: boolean;
} = {}) {
  const dashboard: DashboardState = {
    ...TEST_DASHBOARD_STATE,
    dashboards: {
      1: {
        ...TEST_DASHBOARD_STATE.dashboards[1],
        ordered_tabs: tabs ?? TEST_DASHBOARD_STATE.dashboards[1].ordered_tabs,
      },
    },
  };

  const TestComponent = ({
    location: { pathname },
  }: {
    location: Location;
  }) => {
    const { selectedTabId } = useDashboardTabs({ slug, pathname });

    return (
      <>
        <DashboardTabs slug={slug} pathname={pathname} isEditing={isEditing} />
        <span>Selected tab id is {selectedTabId}</span>
        <br />
        <span>Pathname is {pathname}</span>
      </>
    );
  };

  const { store } = renderWithProviders(
    <Route path="dashboard/:slug(/:tabSlug)" component={TestComponent} />,
    {
      storeInitialState: { dashboard },
      initialRoute: "/dashboard/1",
      withRouter: true,
    },
  );
  return {
    getDashcards: () =>
      Object.values((store.getState() as unknown as State).dashboard.dashcards),
  };
}

function queryTab(numOrName: number | string) {
  const name = typeof numOrName === "string" ? numOrName : `Tab ${numOrName}`;
  return screen.queryByRole("tab", { name });
}

function selectTab(num: number) {
  const selectedTab = queryTab(num) as HTMLElement;
  userEvent.click(selectedTab);
  return selectedTab;
}

function createNewTab() {
  userEvent.click(screen.getByLabelText("Create new tab"));
}

async function selectTabMenuItem(num: number, name: "Delete" | "Rename") {
  const dropdownIcons = screen.getAllByRole("img", {
    name: "chevrondown icon",
  });
  userEvent.click(dropdownIcons[num - 1]);
  (await screen.findByRole("option", { name })).click();
}

async function deleteTab(num: number) {
  return selectTabMenuItem(num, "Delete");
}

async function renameTab(num: number, name: string) {
  await selectTabMenuItem(num, "Rename");

  const inputEl = screen.getByRole("textbox", { name: `Tab ${num}` });
  userEvent.type(inputEl, name);
  fireEvent.keyPress(inputEl, { key: "Enter", charCode: 13 });
}

describe("DashboardTabs", () => {
  beforeEach(() => {
    resetTempTabId();
  });

  describe("when not editing", () => {
    it("should display tabs without menus when there are two or more", () => {
      setup({ isEditing: false });

      expect(queryTab(1)).toBeVisible();
      expect(queryTab(2)).toBeVisible();
    });

    it("should not display tabs when there is one", () => {
      setup({
        isEditing: false,
        tabs: [getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" })],
      });

      expect(queryTab(1)).not.toBeInTheDocument();
      expect(screen.getByText("Pathname is /dashboard/1")).toBeInTheDocument();
    });

    it("should not display tabs when there are none", () => {
      setup({
        isEditing: false,
        tabs: [],
      });

      expect(queryTab(1)).not.toBeInTheDocument();
      expect(screen.getByText("Pathname is /dashboard/1")).toBeInTheDocument();
    });

    describe("when selecting tabs", () => {
      it("should automatically select the first tab on render", async () => {
        setup({ isEditing: false });

        expect(queryTab(1)).toHaveAttribute("aria-selected", "true");
        expect(queryTab(2)).toHaveAttribute("aria-selected", "false");
        expect(queryTab(3)).toHaveAttribute("aria-selected", "false");

        expect(
          await screen.findByText(
            new RegExp(getSlug({ tabId: 1, name: "Tab 1" })),
          ),
        ).toBeInTheDocument();
      });

      it("should allow you to click to select tabs", async () => {
        setup({ isEditing: false });

        expect(selectTab(2)).toHaveAttribute("aria-selected", "true");
        expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
        expect(queryTab(3)).toHaveAttribute("aria-selected", "false");

        expect(
          await screen.findByText(
            new RegExp(getSlug({ tabId: 2, name: "Tab 2" })),
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("when editing", () => {
    it("should display a placeholder tab when there are none", () => {
      setup({ tabs: [] });

      const placeholderTab = queryTab("Tab 1");
      expect(placeholderTab).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Pathname is /dashboard/1")).toBeInTheDocument();
    });

    it("should display a placeholder tab when there is only one", () => {
      setup({
        tabs: [getDefaultTab({ tabId: 1, dashId: 1, name: "Lonely tab" })],
      });

      const placeholderTab = queryTab("Lonely tab");
      expect(placeholderTab).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Pathname is /dashboard/1")).toBeInTheDocument();
    });

    it("should allow you to click to select tabs", async () => {
      setup();

      expect(selectTab(2)).toHaveAttribute("aria-selected", "true");
      expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
      expect(queryTab(3)).toHaveAttribute("aria-selected", "false");

      expect(
        await screen.findByText(
          new RegExp(getSlug({ tabId: 2, name: "Tab 2" })),
        ),
      ).toBeInTheDocument();
    });

    describe("when adding tabs", () => {
      it("should add two tabs, assign cards to the first, and select the second when adding a tab for the first time", () => {
        const { getDashcards } = setup({ tabs: [] });
        createNewTab();
        const firstNewTab = queryTab(1);
        const secondNewTab = queryTab(2);

        expect(firstNewTab).toBeVisible();
        expect(secondNewTab).toBeVisible();

        expect(firstNewTab).toHaveAttribute("aria-selected", "false");
        expect(secondNewTab).toHaveAttribute("aria-selected", "true");

        const dashcards = getDashcards();
        expect(dashcards[0].dashboard_tab_id).toEqual(-1);
        expect(dashcards[1].dashboard_tab_id).toEqual(-1);
      });

      it("should add add one tab, not reassign cards, and select the tab when adding an additional tab", () => {
        const { getDashcards } = setup();
        createNewTab();
        const newTab = queryTab(4);

        expect(newTab).toBeVisible();

        expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
        expect(queryTab(2)).toHaveAttribute("aria-selected", "false");
        expect(queryTab(3)).toHaveAttribute("aria-selected", "false");
        expect(newTab).toHaveAttribute("aria-selected", "true");

        const dashcards = getDashcards();
        expect(dashcards[0].dashboard_tab_id).toEqual(1);
        expect(dashcards[1].dashboard_tab_id).toEqual(2);
      });
    });

    describe("when deleting tabs", () => {
      it("should delete the tab and its cards after clicking `Delete` in the menu", async () => {
        const { getDashcards } = setup();
        await deleteTab(2);

        expect(queryTab(2)).not.toBeInTheDocument();

        const dashcards = getDashcards();
        expect(dashcards[0].isRemoved).toEqual(undefined);
        expect(dashcards[1].isRemoved).toEqual(true);
      });

      it("should select the tab to the left if the selected tab was deleted", async () => {
        setup();
        selectTab(2);
        await deleteTab(2);

        expect(queryTab(1)).toHaveAttribute("aria-selected", "true");
        expect(
          await screen.findByText(
            new RegExp(getSlug({ tabId: 1, name: "Tab 1" })),
          ),
        ).toBeInTheDocument();
      });

      it("should select the tab to the right if the selected tab was deleted and was the first tab", async () => {
        setup();
        selectTab(1);
        await deleteTab(1);

        expect(queryTab(2)).toHaveAttribute("aria-selected", "true");
        expect(
          await screen.findByText(
            new RegExp(getSlug({ tabId: 2, name: "Tab 2" })),
          ),
        ).toBeInTheDocument();
      });

      it("should disable the last tab and remove slug if the penultimate tab was deleted", async () => {
        setup();
        await deleteTab(3);

        expect(
          await screen.findByText(
            new RegExp(getSlug({ tabId: 1, name: "Tab 1" })),
          ),
        ).toBeInTheDocument();

        await deleteTab(2);

        expect(queryTab(1)).toHaveAttribute("aria-disabled", "true");
        expect(
          screen.getByText("Pathname is /dashboard/1"),
        ).toBeInTheDocument();
      });

      it("should correctly update selected tab id when deleting tabs (#30923)", async () => {
        setup({ tabs: [] });
        createNewTab();
        createNewTab();

        await deleteTab(2);
        await deleteTab(2);

        expect(screen.getByText("Selected tab id is -1")).toBeInTheDocument();
      });
    });

    describe("when renaming tabs", () => {
      it("should allow the user to rename the tab after clicking `Rename` in the menu", async () => {
        setup();
        const name = "A cool new name";
        await renameTab(1, name);

        expect(queryTab(name)).toBeInTheDocument();
        expect(
          await screen.findByText(new RegExp(getSlug({ tabId: 1, name }))),
        ).toBeInTheDocument();
      });

      it("should allow renaming via double click", async () => {
        setup();
        const name = "Another cool new name";
        const inputWrapperEl = screen.getAllByTestId(INPUT_WRAPPER_TEST_ID)[0];
        userEvent.dblClick(inputWrapperEl);

        const inputEl = screen.getByRole("textbox", { name: "Tab 1" });
        userEvent.type(inputEl, name);
        fireEvent.keyPress(inputEl, { key: "Enter", charCode: 13 });

        expect(queryTab(name)).toBeInTheDocument();
        expect(
          await screen.findByText(new RegExp(getSlug({ tabId: 1, name }))),
        ).toBeInTheDocument();
      });
    });
  });
});
