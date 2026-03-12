import { Route } from "react-router";

import {
  fireEvent,
  render,
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

const setup = ({
  active = false,
  item = {},
}: {
  active?: boolean;
  item?: Partial<PaletteActionImpl>;
}) => {
  render(
    <PaletteResultItem item={mockPaletteActionImpl(item)} active={active} />,
  );
};

describe("PaletteResultItem", () => {
  it("should not render an icon if none is provided", async () => {
    setup({});
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

/** For some tests we need to render the PaletteResultsList so that the Enter key works */
const setupInList = ({ item }: { item: Partial<PaletteActionImpl> }) => {
  const items = [item];
  const utils = renderWithProviders(
    <>
      <Route
        path="/"
        component={() => (
          <PaletteResultList
            items={items.map((item) => mockPaletteActionImpl(item))}
            maxHeight={580}
            minHeight={220}
            renderItem={({
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
  const link = screen.getByRole("link");
  return { ...utils, link };
};

describe("Mouse/keyboard interactions", () => {
  const initialLocation = {
    pathname: "/",
  };

  describe("The 'Search documentation for...' command palette item", () => {
    const searchDocs: Partial<PaletteActionImpl> = {
      id: "search_docs",
      name: 'Search documentation for "hedgehogs"',
      section: "docs",
      keywords: "hedgehogs",
      icon: "document",
      extra: {
        href: "https://www.metabase.com/search?query=hedgehogs",
      },
    };

    it("should NOT navigate via React router on click (metabase#47829)", async () => {
      const { history, link } = setupInList({ item: searchDocs });
      fireEvent.click(link);
      expect(history?.getCurrentLocation()).toMatchObject(initialLocation);
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  describe("The 'View and filter all N results' command palette item", () => {
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
      const { history, link } = setupInList({ item: viewResults });
      fireEvent(window, new KeyboardEvent("keydown", { key: "Enter" }));
      await waitFor(() => {
        expect(history?.getCurrentLocation()).toMatchObject(searchLocation);
      });
      expect(link).not.toHaveAttribute("target", "_blank");
    });

    it("should navigate via React router on left click", async () => {
      const { history, link } = setupInList({ item: viewResults });
      // A normal, left click
      fireEvent.click(link);
      expect(history?.getCurrentLocation()).toMatchObject(searchLocation);
      expect(link).not.toHaveAttribute("target", "_blank");
    });

    it("should NOT navigate via React router on middle click", async () => {
      const { history, link } = setupInList({ item: viewResults });
      // A middle click
      fireEvent.click(link, { button: 1 });
      expect(history?.getCurrentLocation()).toMatchObject(initialLocation);
      expect(link).not.toHaveAttribute("target", "_blank");
    });
  });
});
