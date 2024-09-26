import { Route } from "react-router";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";

import type { PaletteActionImpl } from "../types";

import { PaletteResultItem } from "./PaletteResultItem";
import { PaletteResultList } from "./PaletteResultsList";

const mockPaletteActionImpl = (opts: Partial<PaletteActionImpl>) =>
  ({
    name: "test action",
    id: "action-1",
    ancestors: [],
    children: [],
    ...opts,
  }) as PaletteActionImpl;

/** The point of these tests is to examine the PaletteResultItem component. We
 * have to place this component in a PaletteResultList so that the Enter key
 * works. */
const setup = ({ item = {} }: { item?: Partial<PaletteActionImpl> }) => {
  const items = [item];
  const utils = renderWithProviders(
    <>
      <Route
        path="/"
        component={() => (
          <PaletteResultList
            items={items.map(item => mockPaletteActionImpl(item))}
            onRender={({
              item,
              active,
            }: {
              item: string | PaletteActionImpl;
              active: boolean;
            }) => {
              // items whose type is string are not relevant to these tests
              if (typeof item === "string") {
                return <></>;
              }
              return <PaletteResultItem item={item} active={active} />;
            }}
          />
        )}
      />
      <Route path="search" component={() => null} />
    </>,
    { withRouter: true, withKBar: true },
  );
  const link = items[0].name ? screen.getByRole("link") : null;
  return { ...utils, link: link as HTMLAnchorElement };
};

describe("PaletteResultsList interactions should work", () => {
  const initialLocation = {
    pathname: "/",
  };
  describe("Search documentation for string", () => {
    const searchDocs: Partial<PaletteActionImpl> = {
      id: "search_docs",
      name: 'Search documentation for "hedgehogs"',
      section: "docs",
      keywords: "hedgehogs",
      icon: "document",
      extra: {
        href: "https://www.metabase.com/search?query=hedgehogs",
        openInNewTab: true,
      },
    };

    // NOTE: This test will correctly fail if openInNewTab is set to false
    it("should NOT navigate via React router on click", async () => {
      const { history, link } = setup({ item: searchDocs });
      fireEvent.click(link);
      expect(history?.getCurrentLocation()).toMatchObject(initialLocation);
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  describe("View and filter all N results", () => {
    const searchLocation = {
      pathname: "search",
      query: {
        q: "hedgehogs",
      },
    };

    const viewResults: Partial<PaletteActionImpl> = {
      id: "search-results-metadata",
      name: "View and filter all 2 results",
      section: "search",
      keywords: "hedgehogs",
      icon: "link",
      perform: () => {},
      extra: {
        href: searchLocation,
      },
    };

    it("should navigate via React router when the Enter key is pressed", async () => {
      const { history, link } = setup({ item: viewResults });
      fireEvent(window, new KeyboardEvent("keydown", { key: "Enter" }));
      await waitFor(() => {
        expect(history?.getCurrentLocation()).toMatchObject(searchLocation);
      });
      expect(link).not.toHaveAttribute("target", "_blank");
    });

    it("should navigate via React router on left click", async () => {
      const { history, link } = setup({ item: viewResults });
      // A normal, left click
      fireEvent.click(link);
      expect(history?.getCurrentLocation()).toMatchObject(searchLocation);
      expect(link).not.toHaveAttribute("target", "_blank");
    });

    it("should NOT navigate via React router on middle click", async () => {
      const { history, link } = setup({ item: viewResults });
      // A middle click
      fireEvent.click(link, { button: 1 });
      expect(history?.getCurrentLocation()).toMatchObject(initialLocation);
      expect(link).not.toHaveAttribute("target", "_blank");
    });
  });
});
