import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, fireEvent } from "__support__/ui";
import { DashboardState, State, StoreDashcard } from "metabase-types/store";
import { DashboardOrderedTab } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";
import { INITIAL_DASHBOARD_STATE } from "metabase/dashboard/constants";
import { getDefaultTab, resetTempTabId } from "metabase/dashboard/actions";

import { INPUT_WRAPPER_TEST_ID } from "metabase/core/components/TabButton";
import { DashboardTabs } from "./DashboardTabs";
import { useDashboardTabs } from "./useDashboardTabs";

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

function createMockDashCard({
  dashCardId,
  tabId,
}: {
  dashCardId: number;
  tabId: number | undefined;
}) {
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
      auto_apply_filters: true,
      "last-edit-info": {
        id: 1,
        email: "",
        first_name: "",
        last_name: "",
        timestamp: "",
      },
      ordered_cards: [1, 2],
      ordered_tabs: [
        getDefaultTab({ tabId: 1, dashId: 1, name: "Page 1" }),
        getDefaultTab({ tabId: 2, dashId: 1, name: "Page 2" }),
        getDefaultTab({ tabId: 3, dashId: 1, name: "Page 3" }),
      ],
    },
  },
  dashcards: {
    1: createMockDashCard({ dashCardId: 1, tabId: 1 }),
    2: createMockDashCard({ dashCardId: 2, tabId: 2 }),
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

  const TestComponent = () => {
    const { selectedTabId } = useDashboardTabs();

    return (
      <>
        <DashboardTabs isEditing={isEditing} />
        <span>Selected tab id is {selectedTabId}</span>
      </>
    );
  };

  const { store } = renderWithProviders(<TestComponent />, {
    storeInitialState: { dashboard },
  });
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

  const inputEl = screen.getByRole("textbox", { name: `Page ${num}` });
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
        tabs: [getDefaultTab({ tabId: 1, dashId: 1, name: "Page 1" })],
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

    describe("when selecting tabs", () => {
      it("should automatically select the first tab on render", () => {
        setup({ isEditing: false });

        expect(queryTab(1)).toHaveAttribute("aria-selected", "true");
        expect(queryTab(2)).toHaveAttribute("aria-selected", "false");
        expect(queryTab(3)).toHaveAttribute("aria-selected", "false");
      });

      it("should allow you to click to select tabs", () => {
        setup({ isEditing: false });

        expect(selectTab(2)).toHaveAttribute("aria-selected", "true");
        expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
        expect(queryTab(3)).toHaveAttribute("aria-selected", "false");
      });
    });
  });

  describe("when editing", () => {
    it("should display a placeholder tab when there are none", () => {
      setup({ tabs: [] });

      const placeholderTab = queryTab("Page 1");
      expect(placeholderTab).toHaveAttribute("aria-disabled", "true");
    });

    it("should display a placeholder tab when there is only one", () => {
      setup({
        tabs: [getDefaultTab({ tabId: 1, dashId: 1, name: "Lonely tab" })],
      });

      const placeholderTab = queryTab("Lonely tab");
      expect(placeholderTab).toHaveAttribute("aria-disabled", "true");
    });

    it("should allow you to click to select tabs", () => {
      setup();

      expect(selectTab(2)).toHaveAttribute("aria-selected", "true");
      expect(queryTab(1)).toHaveAttribute("aria-selected", "false");
      expect(queryTab(3)).toHaveAttribute("aria-selected", "false");
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
      });

      it("should select the tab to the right if the selected tab was deleted and was the first tab", async () => {
        setup();
        selectTab(1);
        await deleteTab(1);

        expect(queryTab(2)).toHaveAttribute("aria-selected", "true");
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
        const newName = "A cool new name";
        await renameTab(1, newName);

        expect(queryTab(newName)).toBeInTheDocument();
      });

      it("should allow renaming via double click", async () => {
        setup();
        const newName = "Another cool new name";
        const inputWrapperEl = screen.getAllByTestId(INPUT_WRAPPER_TEST_ID)[0];
        userEvent.dblClick(inputWrapperEl);

        const inputEl = screen.getByRole("textbox", { name: "Page 1" });
        userEvent.type(inputEl, newName);
        fireEvent.keyPress(inputEl, { key: "Enter", charCode: 13 });

        expect(queryTab(newName)).toBeInTheDocument();
      });
    });
  });
});
