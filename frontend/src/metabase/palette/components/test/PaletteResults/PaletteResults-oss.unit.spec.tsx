import fetchMock from "fetch-mock";
import _ from "underscore";

import { screen, waitFor, within } from "__support__/ui";
import {
  createMockRecentCollectionItem,
  createMockRecentTableItem,
} from "metabase-types/api/mocks";

import { type CommonSetupProps, commonSetup } from "./setup";

const setup = (props: CommonSetupProps = {}) => {
  commonSetup({ ...props, isEE: false });
};

describe("PaletteResults", () => {
  it("should show default actions", async () => {
    setup();
    expect(await screen.findByText("New dashboard")).toBeInTheDocument();
    expect(await screen.findByText("New collection")).toBeInTheDocument();
    expect(await screen.findByText("New model")).toBeInTheDocument();

    expect(screen.queryByText("Search results")).not.toBeInTheDocument();
  });

  //For some reason, New Question isn't showing up without searching. My guess is virtualization weirdness
  it("should allow you to create a new question", async () => {
    setup({ query: "ques" });
    expect(await screen.findByText("New question")).toBeInTheDocument();
  });

  it("should show you recent items", async () => {
    setup();
    expect(await screen.findByText("Recent items")).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Bar Dashboard" }),
    ).toHaveTextContent("lame collection");

    expect(
      await screen.findByRole("link", { name: "Bar Dashboard" }),
    ).toHaveAttribute("href", "/dashboard/1-bar-dashboard");

    expect(
      await screen.findByRole("option", { name: "Foo Question" }),
    ).toHaveTextContent("Our analytics");

    //Foo Question should be not be displayed with a verified badge in OSS
    expect(
      within(
        await screen.findByRole("option", { name: "Foo Question" }),
      ).queryByRole("img", { name: /verified_filled/ }),
    ).not.toBeInTheDocument();
  });

  it("should show recent items with the same name", async () => {
    setup({
      recents: [
        createMockRecentCollectionItem({
          model: "dataset",
          name: "My Awesome Data",
        }),
        createMockRecentTableItem({
          model: "table",
          display_name: "My Awesome Data",
        }),
      ],
    });

    expect(await screen.findByText("Recent items")).toBeInTheDocument();

    expect(
      await screen.findAllByRole("option", { name: "My Awesome Data" }),
    ).toHaveLength(2);
  });

  it("should allow you to search entities, and provide a docs link", async () => {
    setup({ query: "Bar" });

    await waitFor(async () => {
      expect(await screen.findByText("Search results")).toBeInTheDocument();
    });

    expect(
      await screen.findByRole("option", { name: /View and filter/i }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: "Bar Dashboard" }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: "Bar Dashboard" }),
    ).toHaveAttribute("href", "/dashboard/1-bar-dashboard");

    expect(
      await screen.findByRole("option", { name: "Bar Dashboard" }),
    ).toHaveTextContent("Such Bar. Much Wow.");
    expect(
      await screen.findByText('Search documentation for "Bar"'),
    ).toBeInTheDocument();
  });

  it("should display collections that search results are from", async () => {
    setup({
      query: "ques",
    });
    expect(
      await screen.findByRole("option", { name: "Foo Question" }),
    ).toHaveTextContent("Our analytics");

    //Foo Question should not be displayed with a verified badge in OSS
    expect(
      within(
        await screen.findByRole("option", { name: "Foo Question" }),
      ).queryByRole("img", { name: /verified_filled/ }),
    ).not.toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: "Bar Question" }),
    ).toHaveTextContent("lame collection");

    // One call is always made to determine if the instance has models inside useCommandPaletteBasicActions
    expect(fetchMock.calls("path:/api/search").length).toBe(2);
  });

  it("should provide links to settings pages for admins", async () => {
    setup({ query: "setu", isAdmin: true });
    expect(await screen.findByText("Admin")).toBeInTheDocument();
    expect(await screen.findByText("Settings - Setup")).toBeInTheDocument();
  });

  it("should not provide links to settings pages for non-admins", async () => {
    setup({ query: "setu", isAdmin: false });
    expect(
      await screen.findByText(`Search documentation for "setu"`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings - Setup")).not.toBeInTheDocument();
  });

  it("should provide links to admin pages for admins", async () => {
    setup({ query: "permi", isAdmin: true });
    expect(await screen.findByText("Admin")).toBeInTheDocument();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
  });

  it("should not provide links to admin pages for non-admins", async () => {
    setup({ query: "permi", isAdmin: false });
    expect(
      await screen.findByText(`Search documentation for "permi"`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Permissions")).not.toBeInTheDocument();
  });

  it("should not compute search results if 'search-typeahead-enabled' is diabled", async () => {
    setup({ query: "ques", settings: { "search-typeahead-enabled": false } });
    expect(
      await screen.findByRole("option", { name: /View search results/ }),
    ).toBeInTheDocument();

    // One call is always made to determine if the instance has models inside useCommandPaletteBasicActions
    expect(fetchMock.calls("path:/api/search").length).toBe(1);
  });

  it("should provide a link to docs with the proper url param", async () => {
    setup({ query: "model" });
    expect(
      await screen.findByRole("link", { name: /Search documentation/ }),
    ).toHaveAttribute("href", expect.stringContaining("?query=model"));

    // One call is always made to determine if the instance has models inside useCommandPaletteBasicActions
    expect(fetchMock.calls("path:/api/search").length).toBe(2);
  });

  it("should not allow you to select or click disabled items", async () => {
    setup({ query: "modelsssss" });
    expect(await screen.findByLabelText(/No results/)).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      await screen.findByLabelText(/Search documentation/),
    ).toHaveAttribute("aria-disabled", "false");
  });
});
