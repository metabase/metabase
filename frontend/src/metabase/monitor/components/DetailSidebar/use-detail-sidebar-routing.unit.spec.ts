import { act, renderHookWithProviders, waitFor } from "__support__/ui";

import { useDetailSidebarRouting } from "./use-detail-sidebar-routing";

type Item = { key: string };

const ITEMS: Item[] = [{ key: "first" }, { key: "middle" }, { key: "last" }];
const LIST_PATH = "/monitor/items";

const getItemId = (item: Item) => item.key;
const getDetailPath = (id: string) => `${LIST_PATH}/${id}`;

type SetupOpts = {
  isPageLoaded?: boolean;
  selectedId?: string;
  initialRoute?: string;
};

const setup = ({
  isPageLoaded = true,
  selectedId,
  initialRoute = `${LIST_PATH}?page=2`,
}: SetupOpts = {}) =>
  renderHookWithProviders(
    () =>
      useDetailSidebarRouting({
        items: isPageLoaded ? ITEMS : undefined,
        getItemId,
        selectedId,
        listPath: LIST_PATH,
        getDetailPath,
      }),
    { withRouter: true, initialRoute },
  );

describe("useDetailSidebarRouting", () => {
  it("finds the selected item and its neighbours on the page", () => {
    const { result } = setup({ selectedId: "middle" });

    expect(result.current).toMatchObject({
      prevId: "first",
      nextId: "last",
      selectedItem: { key: "middle" },
    });
  });

  it("has no neighbour past either end of the page", () => {
    expect(setup({ selectedId: "first" }).result.current).toMatchObject({
      prevId: undefined,
      nextId: "middle",
    });
    expect(setup({ selectedId: "last" }).result.current).toMatchObject({
      prevId: "middle",
      nextId: undefined,
    });
  });

  it("finds nothing when the selected item isn't on the page, or the page hasn't loaded", () => {
    const nothing = {
      prevId: undefined,
      nextId: undefined,
      selectedItem: undefined,
    };

    expect(setup({ selectedId: "elsewhere" }).result.current).toMatchObject(
      nothing,
    );
    expect(
      setup({ isPageLoaded: false, selectedId: "middle" }).result.current,
    ).toMatchObject(nothing);
  });

  it("opens an item at its own path, keeping the list's query string", async () => {
    const { result, router } = setup();

    act(() => result.current.navigateToItem("middle"));

    await waitFor(() =>
      expect(router?.location.pathname).toBe(`${LIST_PATH}/middle`),
    );
    expect(router?.location.search).toBe("?page=2");
  });

  it("closes back to the list, keeping its query string", async () => {
    const { result, router } = setup({
      selectedId: "middle",
      initialRoute: `${LIST_PATH}/middle?page=2`,
    });

    act(() => result.current.closeSidebar());

    await waitFor(() => expect(router?.location.pathname).toBe(LIST_PATH));
    expect(router?.location.search).toBe("?page=2");
  });
});
