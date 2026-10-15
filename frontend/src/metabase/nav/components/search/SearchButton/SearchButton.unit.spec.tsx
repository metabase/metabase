import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import { SearchButton } from "./SearchButton";

const setup = ({
  initialRoute = "/",
  isSmallScreen = false,
}: { initialRoute?: string; isSmallScreen?: boolean } = {}) => {
  jest.spyOn(window, "matchMedia").mockReturnValue({
    media: "",
    matches: isSmallScreen,
    onchange: jest.fn(),
    dispatchEvent: jest.fn(),
    addListener: jest.fn(),
    addEventListener: jest.fn(),
    removeListener: jest.fn(),
    removeEventListener: jest.fn(),
  });

  renderWithProviders(<Route path="*" element={<SearchButton />} />, {
    withKBar: true,
    withRouter: true,
    initialRoute,
  });
};

describe("SearchButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should show the current search query on the search page (UXW-3370)", () => {
    setup({ initialRoute: "/search?q=products" });

    expect(screen.getByRole("button", { name: /Search/ })).toHaveTextContent(
      "products",
    );
  });

  it("should collapse to an icon-only button on small screens", () => {
    setup({ isSmallScreen: true });

    expect(screen.getByRole("button", { name: "Search" })).toHaveTextContent(
      "",
    );
  });

  it("should show the label and keyboard hint on large screens", () => {
    setup();

    const button = screen.getByRole("button", { name: "Search" });
    expect(button).toHaveTextContent("Search...");
    expect(button).toHaveTextContent("K");
  });
});
