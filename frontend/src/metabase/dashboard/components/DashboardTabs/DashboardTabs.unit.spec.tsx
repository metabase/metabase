import React from "react";
import userEvent from "@testing-library/user-event";

import {
  getIcon,
  renderWithProviders,
  screen,
  fireEvent,
} from "__support__/ui";
import { DashboardState, State, StoreDashcard } from "metabase-types/store";
import { DashboardOrderedTab } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";
import { INITIAL_DASHBOARD_STATE } from "metabase/dashboard/constants";
import { getDefaultTab } from "metabase/dashboard/actions";

import { DashboardTabs } from "./DashboardTabs";

const TEST_CARD = createMockCard({
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  },
});

function createMockDashCard(
  dashCardId: number,
  tabId: number | undefined,
  options?: Partial<StoreDashcard>,
) {
  return {
    id: dashCardId,
    dashboard_id: 1,
    dashboard_tab_id: tabId,
    card_id: 1,
    size_x: 4,
    size_y: 4,
    col: 0,
    row: 0,
    entity_id: "",
    created_at: "",
    updated_at: "",
    card: TEST_CARD,
    ...options,
  };
}

const TEST_DASHBOARD_STATE: DashboardState = {
  ...INITIAL_DASHBOARD_STATE,
  dashboardId: 1,
  dashboards: {
    1: {
      id: 1,
      collection_id: 1,
      name: "",
      description: "",
      can_write: true,
      cache_ttl: null,
      "last-edit-info": {
        id: 1,
        email: "",
        first_name: "",
        last_name: "",
        timestamp: "",
      },
      ordered_cards: [1, 2],
      ordered_tabs: [
        getDefaultTab(1, 1, "Page 1"),
        getDefaultTab(2, 1, "Page 2"),
      ],
    },
  },
  dashcards: {
    1: createMockDashCard(1, 1),
    2: createMockDashCard(2, 2),
  },
};

function setup({
  isEditing = true,
  tabs,
}: {
  isEditing?: boolean;
  tabs?: DashboardOrderedTab[];
  cards?: StoreDashcard[];
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

  const { store } = renderWithProviders(
    <DashboardTabs isEditing={isEditing} />,
    {
      withSampleDatabase: true,
      storeInitialState: { dashboard },
    },
  );
  return {
    getDashcards: () =>
      Object.values((store.getState() as unknown as State).dashboard.dashcards),
  };
}

function queryTab(numOrName: number | string) {
  const name = typeof numOrName === "string" ? numOrName : `Page ${numOrName}`;
  return screen.queryByRole("tab", { name });
}

function selectTab(num: number) {
  const selectedTab = queryTab(num) as HTMLElement;
  userEvent.click(selectedTab);
  return selectedTab;
}

function createNewTab() {
  userEvent.click(getIcon("add", "button"));
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

  const inputEl = screen.getByRole("textbox", { name: `Page ${num}` });
  userEvent.type(inputEl, name);
  fireEvent.keyPress(inputEl, { key: "Enter", charCode: 13 });
}

describe("DashboardTabs", () => {
  describe("when not editing", () => {
    it("should display tabs without menus when there are two or more", () => {
      setup({ isEditing: false });

      expect(queryTab(1)).toBeVisible();
      expect(queryTab(2)).toBeVisible();
    });

    it("should not display tabs when there is one", () => {
      setup({
        isEditing: false,
        tabs: [getDefaultTab(1, 1, "Page 1")],
      });

      expect(queryTab(1)).not.toBeInTheDocument();
    });

    it("should not display tabs when there are none", () => {
      setup({
        isEditing: false,
        tabs: [],
      });

      expect(queryTab(1)).not.toBeInTheDocument();
    });

    it("should automatically select the first tab on render", () => {
      setup({ isEditing: false });

      expect(queryTab(1)).toHaveAttribute("aria-selected", "true");
      expect(queryTab(2)).toHaveAttribute("aria-selected", "false");
    });

    it("should allow you to click to select tabs", () => {
      setup({ isEditing: false });

      expect(selectTab(2)).toHaveAttribute("aria-selected", "true");
      expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("when editing", () => {
    it("should display a placeholder tab when there are none", () => {
      setup({ tabs: [] });

      const placeholderTab = screen.getByRole("tab", { name: "Page 1" });
      expect(placeholderTab).toHaveAttribute("aria-disabled", "true");
    });

    it("should allow you to click to select tabs", () => {
      setup();

      expect(selectTab(2)).toHaveAttribute("aria-selected", "true");
      expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
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
        const newTab = queryTab(3);

        expect(newTab).toBeVisible();

        expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
        expect(queryTab(2)).toHaveAttribute("aria-selected", "false");
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

        expect(
          screen.queryByRole("tab", { name: "Page 2" }),
        ).not.toBeInTheDocument();

        const dashcards = getDashcards();
        expect(dashcards[0].isRemoved).toEqual(undefined);
        expect(dashcards[1].isRemoved).toEqual(true);
      });

      it("should select the tab to the left if the selected tab was deleted", async () => {
        setup();
        selectTab(2);
        await deleteTab(2);

        expect(queryTab(1)).toHaveAttribute("aria-selected", "true");
      });

      it("should select the tab to the right if the selected tab was deleted and was the first tab", async () => {
        setup();
        selectTab(1);
        await deleteTab(1);

        expect(queryTab(2)).toHaveAttribute("aria-selected", "true");
      });
    });

    describe("when renaming tabs", () => {
      it("should allow the user to rename the tab after clicking `Rename` in the menu", async () => {
        setup();
        const newName = "A cool new name";
        await renameTab(1, newName);

        expect(queryTab(newName)).toBeInTheDocument();
      });
    });
  });
});
