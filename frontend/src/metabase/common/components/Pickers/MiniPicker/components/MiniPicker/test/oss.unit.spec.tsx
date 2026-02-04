import userEvent from "@testing-library/user-event";

import { findRequests, setupCardEndpoints } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("MiniPicker", () => {
  it("renders the MiniPicker", async () => {
    await setup();
    expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();
  });

  it("shows browse when the onBrowseAll prop is provided", async () => {
    await setup({ onBrowseAll: jest.fn() });
    expect(await screen.findByText("Browse all")).toBeInTheDocument();
  });

  it("does not show browse when the onBrowseAll prop is not provided", async () => {
    await setup({ onBrowseAll: undefined });
    expect(screen.queryByText("Browse all")).not.toBeInTheDocument();
  });

  it("records recent items when an item is picked", async () => {
    const { onChangeSpy } = await setup();
    await userEvent.click(await screen.findByText("Mini Db"));
    await userEvent.click(await screen.findByText("public"));
    await userEvent.click(await screen.findByText("roads"));

    expect(onChangeSpy).toHaveBeenCalledWith({
      id: 2,
      model: "table",
      name: "roads",
      db_id: 1,
    });

    const [req] = await findRequests("POST");

    expect(req.url).toContain("/api/activity/recents");
    expect(req.body).toEqual({
      context: "selection",
      model: "table",
      model_id: 2,
    });
  });

  it("shows 'Collections' when an adult decides you can't have access to Our analytics", async () => {
    await setup({}, { hasAccessToRoot: false });

    expect(await screen.findByText("Collections")).toBeInTheDocument();
    expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();

    // Should still be able to navigate into collections
    await userEvent.click(await screen.findByText("Collections"));
    expect(await screen.findByText("more things")).toBeInTheDocument();
  });

  describe("tables", () => {
    it("can pick a table from a db with multiple schemas", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Mini Db"));
      await userEvent.click(await screen.findByText("public"));
      await userEvent.click(await screen.findByText("weather"));

      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 1,
        model: "table",
        name: "weather",
        db_id: 1,
      });
    });

    it("can pick a table from a db with a single schema", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Solo Db"));
      // doesn't show schema
      expect(screen.queryByText("only")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByText("pride"));

      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 6,
        model: "table",
        name: "pride",
        db_id: 2,
      });
    });

    it("can pick a table from a db with no schemas", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("NoSchema Db"));
      // doesn't show schema
      expect(screen.queryByText("only")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByText("mary"));

      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 10,
        model: "table",
        name: "mary",
        db_id: 3,
      });
    });

    it("shows proper back headers when navigating into db and schema", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Mini Db"));
      expect(await screen.findByText("Mini Db")).toBeInTheDocument(); // db header
      await userEvent.click(await screen.findByText("pokemon"));
      expect(await screen.findByText("pokemon")).toBeInTheDocument(); // schema header
      expect(await screen.findByText("pokedex")).toBeInTheDocument(); // table
    });

    it("should show a schema when provided a table as a value", async () => {
      await setup({
        value: {
          model: "table",
          id: 4,
          // @ts-expect-error - needed to make compatible with minipicker and entity picker
          db_id: 1,
          schema: "pokemon",
          name: "cards",
        },
      });
      expect(await screen.findByText("pokemon")).toBeInTheDocument();
      expect(await screen.findByText("cards")).toBeInTheDocument();
      expect(await screen.findByText("pokedex")).toBeInTheDocument();
    });
  });

  describe("collections", () => {
    it("can pick a model", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("more things"));
      await userEvent.click(await screen.findByText("Meryton"));
      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 203,
        model: "dataset",
        name: "Meryton",
      });
    });

    it("can pick a question", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("Brighton"));
      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 102,
        model: "card",
        name: "Brighton",
      });
    });

    it("can pick a metric", async () => {
      const { onChangeSpy } = await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Brighton")).toBeInTheDocument();
      await userEvent.click(await screen.findByText("Catherine"));
      expect(onChangeSpy).toHaveBeenCalledWith({
        id: 106,
        model: "metric",
        name: "Catherine",
      });
    });

    it("ignores documents", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Brighton")).toBeInTheDocument();
      expect(screen.queryByText("Longbourn")).not.toBeInTheDocument();
    });

    it("ignores metrics when the model is missing", async () => {
      await setup({
        models: ["table", "dataset", "card"],
      });
      await userEvent.click(await screen.findByText("Our analytics"));
      expect(await screen.findByText("Brighton")).toBeInTheDocument();
      expect(screen.queryByText("Catherine")).not.toBeInTheDocument();
    });

    it("should show a collection when provided a card as a value", async () => {
      setupCardEndpoints(
        createMockCard({
          id: 202,
          name: "Rosings",
          collection_id: 101,
          collection: createMockCollection({
            id: 101,
            effective_location: "/",
          }),
        }),
      );
      await setup({
        value: {
          id: 202,
          model: "card",
          database_id: 1,
        },
      });
      expect(await screen.findByText("more things")).toBeInTheDocument();
      expect(await screen.findByText("Rosings")).toBeInTheDocument();
      expect(await screen.findByText("Meryton")).toBeInTheDocument(); // sibling
      expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument(); // document sibling
    });
  });

  describe("search", () => {
    it("shows search results", async () => {
      await setup({ searchQuery: "e" });
      expect(await screen.findByText("Forster")).toBeInTheDocument();
      expect(await screen.findByText("Bingley")).toBeInTheDocument();
    });

    it("shows the collection name for collection items in search results", async () => {
      await setup({ searchQuery: "bing" });
      expect(await screen.findByText("Bingley")).toBeInTheDocument();
      expect(await screen.findByText("Misc Metrics")).toBeInTheDocument();
    });

    it("shows the collection name for our analytics", async () => {
      await setup({ searchQuery: "Fan" });
      expect(await screen.findByText("Fanny")).toBeInTheDocument();
      expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    });

    it("shows db and schema names for table items in search results", async () => {
      await setup({ searchQuery: "wick" });
      expect(await screen.findByText("wickham")).toBeInTheDocument();
      expect(await screen.findByText("london (lydia)")).toBeInTheDocument();
    });

    it("shows collection name for a table in a collection", async () => {
      await setup({ searchQuery: "kit" });
      expect(await screen.findByText("Kitty")).toBeInTheDocument();
      expect(await screen.findByText("Misc Tables")).toBeInTheDocument();

      // should not show table or schema
      expect(screen.queryByText(/big_secret/)).not.toBeInTheDocument();
      expect(screen.queryByText(/also_secret/)).not.toBeInTheDocument();
    });

    it("properly filters search results", async () => {
      await setup({ searchQuery: "a" });
      expect(await screen.findByText("Lucas")).toBeInTheDocument();
      expect(screen.queryByText("Wickham")).not.toBeInTheDocument();
    });

    it("can pick a search result", async () => {
      const { onChangeSpy } = await setup({ searchQuery: "e" });
      expect(await screen.findByText("Forster")).toBeInTheDocument();
      expect(await screen.findByText("Bingley")).toBeInTheDocument();
      await userEvent.click(await screen.findByText("Bingley"));

      expect(onChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 303,
          model: "metric",
          name: "Bingley",
        }),
      );
    });
  });
});
