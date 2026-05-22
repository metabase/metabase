import {
  activateTab,
  addTab,
  removeTab,
  tabsReducer,
  tabsSelectors,
  updateTab,
} from "./tabs.slice";
import type { TabsState } from "./tabs.types";

const initialState: TabsState = {
  ids: [],
  entities: {},
  activeId: undefined,
};

const seed = (...paths: string[]) =>
  paths.reduce(
    (state, path) =>
      tabsReducer(state, addTab({ path, title: path, icon: "table" })),
    initialState,
  );

describe("tabs slice", () => {
  it("adds a tab and marks it active", () => {
    const next = tabsReducer(
      initialState,
      addTab({ path: "/dashboard/1", title: "Sales", icon: "dashboard" }),
    );
    const all = tabsSelectors.selectAll({ tabs: next } as never);
    expect(all).toHaveLength(1);
    expect(next.activeId).toBe(all[0].id);
  });

  it("activates an existing tab by id", () => {
    const seeded = seed("/a", "/b");
    const targetId = seeded.ids[0] as string;
    const next = tabsReducer(seeded, activateTab(targetId));
    expect(next.activeId).toBe(targetId);
  });

  it("ignores activateTab for unknown ids", () => {
    const seeded = seed("/a");
    const next = tabsReducer(seeded, activateTab("missing"));
    expect(next.activeId).toBe(seeded.activeId);
  });

  it("removes a tab and reassigns active when the active one is removed", () => {
    const seeded = seed("/a", "/b");
    const activeId = seeded.activeId as string;
    const next = tabsReducer(seeded, removeTab(activeId));
    expect(tabsSelectors.selectAll({ tabs: next } as never)).toHaveLength(1);
    expect(next.activeId).toBeDefined();
    expect(next.activeId).not.toBe(activeId);
  });

  it("updates an existing tab", () => {
    const seeded = seed("/a");
    const id = seeded.ids[0] as string;
    const next = tabsReducer(
      seeded,
      updateTab({ id, changes: { path: "/b", title: "B", icon: "folder" } }),
    );
    const tab = tabsSelectors.selectById({ tabs: next } as never, id);
    expect(tab).toMatchObject({ path: "/b", title: "B", icon: "folder" });
  });
});
