import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";

import { setup } from "./setup";

const expectActiveItem = async (itemName: string) =>
  waitFor(() =>
    expect(
      screen.getByRole("link", { name: new RegExp(itemName) }),
    ).toHaveAttribute("data-active", "true"),
  );

const expectInactiveItem = async (itemName: string) =>
  waitFor(() =>
    expect(
      screen.getByRole("link", { name: new RegExp(itemName) }),
    ).not.toHaveAttribute("data-active", "true"),
  );

const expectVisibleItem = async (itemName: string) =>
  waitFor(() =>
    expect(
      screen.getByRole("link", { name: new RegExp(itemName) }),
    ).toBeVisible(),
  );

describe("EntityPickerModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Default Behavior", () => {
    it("should render a picker", async () => {
      await setup({ title: "Test picker 😁" });
      expect(await screen.findByText("Test picker 😁")).toBeInTheDocument();
    });

    it("should open databases if enabled", async () => {
      await setup({ options: { hasDatabases: true } });
      await expectActiveItem("Databases");
    });

    it("should not show databases if there are none", async () => {
      await setup({ options: { hasDatabases: true }, databases: [] });
      await expectVisibleItem("Recent items");
      expect(screen.queryByText("Databases")).not.toBeInTheDocument();
    });

    it("should display root items when there are no databases or recents", async () => {
      await setup({
        options: { hasDatabases: true, hasRecents: false },
        databases: [],
      });

      await expectInactiveItem("Our analytics");
      expect(screen.queryByText("Databases")).not.toBeInTheDocument();
      expect(screen.queryByText("Recent items")).not.toBeInTheDocument();
    });

    it("Should select recents by default without databases", async () => {
      await setup();
      await expectActiveItem("Recent items");
    });

    it("Should select our analytics by default without databases or recents", async () => {
      await setup({
        options: { hasRecents: false, hasDatabases: false },
        models: ["collection", "card", "dashboard"],
      });
      await expectActiveItem("Our analytics");
    });
  });

  describe("Collection Navigation", () => {
    it("should auto-select a collection path based on value item", async () => {
      await setup({ value: { id: 33, model: "collection" } });

      await expectActiveItem("Our analytics");
      await expectActiveItem("First Collection");
      await expectActiveItem("Nested Collection");
      await expectInactiveItem("Question in Nested Coll");
    });

    it("should only hit collection/items endpoint once for each collection (backparse cache hit)", async () => {
      await setup({ value: { id: 33, model: "collection" } });

      await expectActiveItem("Our analytics");
      await expectActiveItem("First Collection");
      await expectActiveItem("Nested Collection");
      await expectInactiveItem("Question in Nested Coll");
      const gets = await findRequests("GET");

      // if we get 2 hits on any of these, the api request in
      // use-get-path-from-value got desynced from the one in CollectionItemList
      const rootHits = gets.filter((req) =>
        req.url.includes("/api/collection/root/items"),
      );
      const firstCollectionHits = gets.filter((req) =>
        req.url.includes("/api/collection/11/items"),
      );
      const nestedCollectionHits = gets.filter((req) =>
        req.url.includes("/api/collection/33/items"),
      );
      expect(rootHits).toHaveLength(1);
      expect(firstCollectionHits).toHaveLength(1);
      expect(nestedCollectionHits).toHaveLength(1);
    });

    it("should navigate into collections when clicked", async () => {
      await setup({ value: { id: "root", model: "collection" } });
      await expectActiveItem("Our analytics"); // level 0
      await userEvent.click(await screen.findByText("First Collection")); // level 1
      await expectActiveItem("First Collection");

      expect(
        await screen.findByText("Question in Collection 1"), // level 2
      ).toBeInTheDocument();
      expect(
        await screen.findByText("Dashboard in Collection 1"),
      ).toBeInTheDocument();
      await expectInactiveItem("Nested Collection");
      await userEvent.click(await screen.findByText(/Nested Collection/));
      await expectActiveItem("Nested Collection");
      await expectInactiveItem("Question in Nested Coll"); // level 3
    });

    it("should navigate back", async () => {
      await setup({ value: { id: 33, model: "collection" } });

      await expectVisibleItem("Question in Nested Coll");
      await userEvent.click(await screen.findByText("First Collection"));
      await expectVisibleItem("Nested Collection");

      // nested item no longer visible
      expect(
        screen.queryByText(/Question in Nested Coll/),
      ).not.toBeInTheDocument();
    });

    it("should navigate sideways", async () => {
      await setup({ value: { id: "root", model: "collection" } });
      await expectActiveItem("Our analytics"); // level 0

      await userEvent.click(await screen.findByText("First Collection")); // level 1
      await expectActiveItem("First Collection");
      await expectVisibleItem("Question in Collection 1"); // level 2
      await expectVisibleItem("Dashboard in Collection 1");

      await userEvent.click(await screen.findByText("Second Collection")); // level 1
      await expectActiveItem("Second Collection");
      await expectInactiveItem("First Collection"); // level 2
      await expectVisibleItem("Question in Collection 2"); // level 2
      await expectVisibleItem("Model in Collection 2");
      expect(
        screen.queryByText("Question in Collection 1"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Database Navigation", () => {
    it("should show databases item", async () => {
      await setup({ options: { hasDatabases: true } });
      await userEvent.click(await screen.findByText("Databases"));

      await expectActiveItem("Databases");
    });

    it("should hide databases item by default", async () => {
      await setup();
      await expectVisibleItem("Our analytics");
      expect(screen.queryByText("Databases")).not.toBeInTheDocument();
    });

    it("should auto-select a table path based on value item", async () => {
      await setup({
        options: { hasDatabases: true },
        value: { id: 32, model: "table" },
      });

      await expectActiveItem("Databases");
      await expectActiveItem("Database 3");
      await expectActiveItem("schema five");
      await expectActiveItem("Table 32");
    });

    it("hides schemas when there's only one in a db", async () => {
      await setup({
        options: { hasDatabases: true },
        value: { id: 20, model: "table" },
      });

      await expectActiveItem("Databases");
      await expectActiveItem("Database 2");
      await expectActiveItem("Table 20");
      expect(screen.queryByText(/schema/i)).not.toBeInTheDocument();
    });

    it("can disable databases based on isDisabledItem", async () => {
      await setup({
        options: { hasDatabases: true },
        value: { id: 2, model: "database" },
        isDisabledItem: (item) => item.model === "database" && item.id === 3,
      });
      await expectActiveItem("Database 2");
      await expectVisibleItem("Database 3");
      const db3Item = await screen.findByRole("link", { name: /Database 3/ });
      expect(db3Item).toHaveAttribute("data-disabled", "true");
    });

    it("can hide databases based on isDisabledItem", async () => {
      await setup({
        options: { hasDatabases: true },
        value: { id: 2, model: "database" },
        isHiddenItem: (item) => item.model === "database" && item.id === 3,
      });
      await expectActiveItem("Database 2");
      expect(screen.queryByText("Database 3")).not.toBeInTheDocument();
    });

    it("can disable table selection based on isSelectableItem", async () => {
      await setup({
        options: { hasDatabases: true },
        value: { id: 2, model: "database" },
        isSelectableItem: (item) => item.model === "table" && item.id !== 21,
      });
      await expectActiveItem("Database 2");
      await expectVisibleItem("Table 20");
      await expectVisibleItem("Table 21");
      await expectVisibleItem("Table 22");

      await userEvent.click(await screen.findByText("Table 20"));
      expect(
        await screen.findByRole("button", { name: "Select" }),
      ).toBeEnabled();

      await userEvent.click(await screen.findByText("Table 21"));
      expect(
        await screen.findByRole("button", { name: "Select" }),
      ).toBeDisabled();
    });
  });

  describe("Selection", () => {
    it("should show confirm button and text based on option", async () => {
      await setup({
        options: { hasConfirmButtons: true, confirmButtonText: "YES PLEASE" },
      });

      expect(
        await screen.findByRole("button", { name: "YES PLEASE" }),
      ).toBeInTheDocument();
    });

    it("should hide confirm button when option is false", async () => {
      await setup({
        options: { hasConfirmButtons: false, confirmButtonText: "Select" },
      });
      await expectVisibleItem("Our analytics");

      expect(
        screen.queryByRole("button", { name: /Select/i }),
      ).not.toBeInTheDocument();
    });

    it("should call onChange when selecting a collection item", async () => {
      const { onChange } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("First Collection"));
      await userEvent.click(
        await screen.findByText("Question in Collection 1"),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Select" }),
      );

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 100,
            model: "card",
            name: "Question in Collection 1",
          }),
        );
      });
    });

    it("should call onChange without a confirm button", async () => {
      const { onChange } = await setup({
        options: { hasConfirmButtons: false },
      });
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("First Collection"));
      await userEvent.click(
        await screen.findByText("Question in Collection 1"),
      );

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 100,
          model: "card",
          name: "Question in Collection 1",
        }),
      );
    });

    it("should select a nested item", async () => {
      const { onChange } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("First Collection"));
      await userEvent.click(await screen.findByText("Nested Collection"));
      await userEvent.click(await screen.findByText("Metric in Nested Coll"));
      await userEvent.click(
        await screen.findByRole("button", { name: "Select" }),
      );

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 301,
          model: "metric",
          name: "Metric in Nested Coll",
        }),
      );
    });

    it("should allow selecting a collection itself", async () => {
      const { onChange } = await setup({
        models: ["collection", "card", "dashboard"],
      });
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("First Collection"));
      await userEvent.click(
        await screen.findByRole("button", { name: "Select" }),
      );

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 11,
          model: "collection",
          name: "First Collection",
        }),
      );
    });

    it("can disable selection based on provided models", async () => {
      const { onChange } = await setup({
        models: ["card"], // no collections
      });
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("First Collection"));
      await expectActiveItem("First Collection");
      const selectButton = await screen.findByRole("button", {
        name: "Select",
      });
      expect(selectButton).toBeDisabled();
      await userEvent.click(selectButton);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("can disable selection based on isSelectableItem callback", async () => {
      const { onChange } = await setup({
        isSelectableItem: (item) => !item.name.includes("1"),
      });

      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("First Collection"));
      await userEvent.click(
        await screen.findByText("Question in Collection 1"),
      );
      await expectActiveItem("Question in Collection 1");
      // can't ultimately select anything with 1 in the name
      const selectButton = await screen.findByRole("button", {
        name: "Select",
      });
      expect(selectButton).toBeDisabled();
      await userEvent.click(selectButton);

      expect(onChange).not.toHaveBeenCalled();

      await userEvent.click(await screen.findByText("Second Collection"));
      await userEvent.click(
        await screen.findByText("Question in Collection 2"),
      );
      await expectActiveItem("Question in Collection 2");
      // can select items without 1 in the name
      const selectButton2 = await screen.findByRole("button", {
        name: "Select",
      });
      expect(selectButton2).toBeEnabled();
      await userEvent.click(selectButton2);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 200,
          model: "card",
          name: "Question in Collection 2",
        }),
      );
    });
  });

  describe("Search", () => {
    const waitForSearchResults = async () => {
      // input debounce means we need to wait for a little longer
      return screen.findByText(/Search results/i, {}, { timeout: 400 });
    };

    it("should not show search nav item without a search query", async () => {
      await setup();
      await expectInactiveItem("Our analytics");
      expect(screen.getByPlaceholderText(/Search…/i)).toBeInTheDocument();
      expect(screen.queryByText(/Search results/i)).not.toBeInTheDocument();
    });

    it("should hide search based on option", async () => {
      await setup({ options: { hasSearch: false } });
      await expectInactiveItem("Our analytics");
      expect(screen.queryByPlaceholderText(/Search…/i)).not.toBeInTheDocument();
    });

    it("should show a search nav item with a search query", async () => {
      await setup();

      await userEvent.type(
        await screen.findByPlaceholderText("Search…"),
        "My",
        { delay: 50 },
      );
      await waitForSearchResults();
      await expectActiveItem('Search results for "My"');
    });

    it("should return to previous location when clearing the search input", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("First Collection"));
      await userEvent.click(
        await screen.findByText("Question in Collection 1"),
      );
      await expectActiveItem("Question in Collection 1");
      await userEvent.type(
        await screen.findByPlaceholderText("Search…"),
        "My",
        { delay: 50 },
      );
      await waitForSearchResults();
      // search is open
      await expectActiveItem('Search results for "My"');
      // selected item is gone
      expect(
        screen.queryByText("Question in Collection 1"),
      ).not.toBeInTheDocument();
      await userEvent.click(await screen.findByTestId("clear-search"));
      // input is empty
      expect(await screen.findByPlaceholderText("Search…")).toHaveValue("");
      // previous item is active again
      await expectActiveItem("Question in Collection 1");
    });

    it("should show search results", async () => {
      await setup();

      await userEvent.type(
        await screen.findByPlaceholderText("Search…"),
        "My",
        { delay: 50 },
      );
      await waitForSearchResults();
      await expectVisibleItem("Search Result Card 3");
      await expectVisibleItem("Search Result Dashboard 5");
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(11);
    });

    it("should hide search results based on isHiddenItem", async () => {
      await setup({
        isHiddenItem: (item) => item.name.includes("Dash"),
      });

      await userEvent.type(
        await screen.findByPlaceholderText("Search…"),
        "My",
        { delay: 50 },
      );
      await waitForSearchResults();
      await expectVisibleItem("Search Result Card 3");
      expect(
        screen.queryByText("Search Result Dashboard 5"),
      ).not.toBeInTheDocument();
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(9);
    });

    it("should hide search results based on isDisabledItem", async () => {
      await setup({
        isDisabledItem: (item) => item.name.includes("Dash"),
      });

      await userEvent.type(
        await screen.findByPlaceholderText("Search…"),
        "My",
        { delay: 50 },
      );
      await waitForSearchResults();
      await expectVisibleItem("Search Result Card 3");
      expect(
        screen.queryByText("Search Result Dashboard 5"),
      ).not.toBeInTheDocument();
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(9);
    });

    it("should hide search results based on isSelectableItem", async () => {
      await setup({
        isSelectableItem: (item) => !item.name.includes("Dash"),
      });

      await userEvent.type(
        await screen.findByPlaceholderText("Search…"),
        "My",
        { delay: 50 },
      );
      await waitForSearchResults();
      await expectVisibleItem("Search Result Card 3");
      expect(
        screen.queryByText("Search Result Dashboard 5"),
      ).not.toBeInTheDocument();
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(9);
    });

    it("should hide search results based on provided models", async () => {
      await setup({
        models: ["table", "card"],
      });

      await userEvent.type(
        await screen.findByPlaceholderText("Search…"),
        "My",
        { delay: 50 },
      );
      await waitForSearchResults();
      await expectVisibleItem("Search Result Card 3");
      await expectVisibleItem("Search Result Card 4");
      await expectVisibleItem("Search Result Table 9");
      await expectVisibleItem("Search Result Table 10");
      expect(screen.queryByText(/Search Result Dash/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Search Result Metric/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Search Result Collection/),
      ).not.toBeInTheDocument();
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(4);
    });

    describe("Search Scope", () => {
      it("should default to searching the current collection", async () => {
        await setup();
        await userEvent.click(await screen.findByText("Our analytics"));
        await userEvent.click(await screen.findByText("First Collection"));

        await userEvent.type(
          await screen.findByPlaceholderText("Search…"),
          "My",
          { delay: 50 },
        );
        await waitForSearchResults();
        await expectActiveItem('Search results for "My"');
        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "First Collection" },
          ),
        ).toBeChecked();
        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "Everywhere" },
          ),
        ).not.toBeChecked();
      });

      it("does not narrow search scope in non-numeric collections", async () => {
        await setup();
        await userEvent.click(await screen.findByText("Our analytics"));

        await userEvent.type(
          await screen.findByPlaceholderText("Search…"),
          "My",
          { delay: 50 },
        );
        await waitForSearchResults();
        await expectActiveItem('Search results for "My"');
        expect(
          within(
            await screen.findByTestId("search-scope-selector"),
          ).queryByText("Our analytics"),
        ).not.toBeInTheDocument();

        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "Everywhere" },
          ),
        ).toBeChecked();
      });

      it("can search only databases", async () => {
        await setup({ options: { hasDatabases: true } });
        await userEvent.click(await screen.findByText("Databases"));

        await userEvent.type(
          await screen.findByPlaceholderText("Search…"),
          "My",
          { delay: 50 },
        );
        await waitForSearchResults();
        await expectActiveItem('Search results for "My"');
        expect(
          within(
            await screen.findByTestId("search-scope-selector"),
          ).queryByText("Our analytics"),
        ).not.toBeInTheDocument();

        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "Databases" },
          ),
        ).toBeChecked();
        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "Everywhere" },
          ),
        ).not.toBeChecked();
      });

      it("can switch search scopes", async () => {
        await setup();
        await userEvent.click(await screen.findByText("Our analytics"));
        await userEvent.click(await screen.findByText("First Collection"));

        await userEvent.type(
          await screen.findByPlaceholderText("Search…"),
          "My",
          { delay: 50 },
        );
        await waitForSearchResults();
        await expectActiveItem('Search results for "My"');
        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "First Collection" },
          ),
        ).toBeChecked();
        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "Everywhere" },
          ),
        ).not.toBeChecked();

        const gets = await findRequests("GET");
        const lastGet = gets.slice(-1)[0];
        expect(lastGet.url).toContain("collection=11");

        await userEvent.click(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "Everywhere" },
          ),
        );

        expect(
          within(await screen.findByTestId("search-scope-selector")).getByRole(
            "radio",
            { name: "Everywhere" },
          ),
        ).toBeChecked();

        const getsAfter = await findRequests("GET");
        const lastGetAfter = getsAfter.slice(-1)[0];
        expect(lastGetAfter.url).not.toContain("collection=11");
      });
    });
  });

  describe("Recents", () => {
    it("should show a recents menu item", async () => {
      await setup();
      await expectActiveItem("Recent items");
    });

    it("should hide recents based on option", async () => {
      await setup({ options: { hasRecents: false, hasDatabases: false } });
      await expectVisibleItem("Our analytics");
      expect(screen.queryByText("Recent items")).not.toBeInTheDocument();
    });

    it("should show recent items in recents", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Recent items"));
      await expectVisibleItem("Recent Question 1");
      await expectVisibleItem("Recent Question 2");
      await expectVisibleItem("Recent Table");
      await expectVisibleItem("Recent Dashboard");
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(5);
    });

    it("should filter out irrelevant models", async () => {
      await setup({
        models: ["table", "card"],
      });

      expect(await screen.findByText("Recent Question 1")).toBeInTheDocument();
      expect(await screen.findByText("Recent Question 2")).toBeInTheDocument();
      expect(await screen.findByText("Recent Table")).toBeInTheDocument();
      expect(screen.queryByText("Recent Dashboard")).not.toBeInTheDocument();
    });

    it("should hide recents based on isHiddenItem", async () => {
      await setup({
        models: ["table", "card"],
        isHiddenItem: (item) => item.name.includes("2"),
      });

      await userEvent.click(await screen.findByText("Recent items"));
      await expectVisibleItem("Recent Question 1");
      await expectVisibleItem("Recent Table");
      expect(screen.queryByText("Recent Question 2")).not.toBeInTheDocument();
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(2);
    });

    it("should hide recents based on isDisabledItem", async () => {
      await setup({
        models: ["table", "card"],
        isDisabledItem: (item) => item.name.includes("2"),
      });

      await userEvent.click(await screen.findByText("Recent items"));
      await expectVisibleItem("Recent Question 1");
      await expectVisibleItem("Recent Table");
      expect(screen.queryByText("Recent Question 2")).not.toBeInTheDocument();
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(2);
    });

    it("should hide recents based on isSelectableItem", async () => {
      await setup({
        models: ["table", "card"],
        isSelectableItem: (item) => !item.name.includes("2"),
      });

      await userEvent.click(await screen.findByText("Recent items"));
      await expectVisibleItem("Recent Question 1");
      await expectVisibleItem("Recent Table");
      expect(screen.queryByText("Recent Question 2")).not.toBeInTheDocument();
      const searchList = await screen.findByTestId("item-picker-level-1");
      expect(within(searchList).getAllByRole("link")).toHaveLength(2);
    });
  });
});
