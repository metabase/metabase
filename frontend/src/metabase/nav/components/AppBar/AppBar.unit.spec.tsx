import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import type { AppBarProps } from "./AppBar";
import AppBar from "./AppBar";

function getNewItemButtonMock() {
  const NewItemButtonMock = () => <div data-testid="new-button" />;
  return NewItemButtonMock;
}
function getSearchBarMock() {
  const SearchBarMock = () => <div data-testid="search-bar" />;
  return SearchBarMock;
}
function getSearchButtonMock() {
  const SearchButtonMock = {
    SearchButton: () => <div data-testid="search-button" />,
  };
  return SearchButtonMock;
}
function getBreadcrumbsMock() {
  const BreadcrumbsMock = () => <div data-testid="collection-path" />;
  return BreadcrumbsMock;
}
function getQuestionLineageMock() {
  const QuestionLineageMock = () => <div data-testid="question-lineage" />;
  return QuestionLineageMock;
}

jest.mock("../NewItemButton", () => getNewItemButtonMock());
jest.mock("../search/SearchBar/SearchBar", () => getSearchBarMock());
jest.mock("../search/SearchButton/SearchButton", () => getSearchButtonMock());
jest.mock("../../containers/CollectionBreadcrumbs", () => getBreadcrumbsMock());
jest.mock("../../containers/QuestionLineage", () => getQuestionLineageMock());

describe("AppBar", () => {
  let matchMediaSpy: jest.SpyInstance;

  beforeEach(() => {
    matchMediaSpy = jest.spyOn(window, "matchMedia");
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  describe("large screens", () => {
    beforeEach(() => {
      matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
    });

    it("should render the desktop app bar", () => {
      const props = getProps({
        isNavBarEnabled: true,
        isCollectionPathVisible: true,
        isSearchVisible: true,
        isNewButtonVisible: true,
        isLogoVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("main-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("search-button")).toBeInTheDocument();
      expect(screen.getByTestId("new-button")).toBeInTheDocument();
    });

    it("should render the desktop app bar for saved questions and dashboards", () => {
      const props = getProps({
        isCollectionPathVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("collection-path")).toBeInTheDocument();
      expect(screen.queryByTestId("question-lineage")).not.toBeInTheDocument();
    });

    it("should render the desktop app bar for unsaved questions", () => {
      const props = getProps({
        isCollectionPathVisible: true,
        isQuestionLineageVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("question-lineage")).toBeInTheDocument();
      expect(screen.queryByTestId("collection-path")).not.toBeInTheDocument();
    });

    it("should render the search bar when embedded", () => {
      const props = getProps({
        isNavBarEnabled: true,
        isCollectionPathVisible: true,
        isSearchVisible: true,
        isEmbeddingIframe: true,
        isNewButtonVisible: true,
        isLogoVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("search-bar")).toBeInTheDocument();
      expect(screen.queryByTestId("search-button")).not.toBeInTheDocument();
    });
  });

  describe("small screens", () => {
    beforeEach(() => {
      matchMediaSpy.mockReturnValue(getMediaQuery({ matches: true }));
    });

    it("should render the mobile app bar", () => {
      const props = getProps({
        isNavBarEnabled: true,
        isCollectionPathVisible: true,
        isSearchVisible: true,
        isNewButtonVisible: true,
        isLogoVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("main-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("search-button")).toBeInTheDocument();
      expect(screen.queryByTestId("new-button")).not.toBeInTheDocument();
    });

    it("should render the mobile app bar for saved questions and dashboards", () => {
      const props = getProps({
        isCollectionPathVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("collection-path")).toBeInTheDocument();
      expect(screen.queryByTestId("question-lineage")).not.toBeInTheDocument();
    });

    it("should render the mobile app bar for unsaved questions", () => {
      const props = getProps({
        isCollectionPathVisible: true,
        isQuestionLineageVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("question-lineage")).toBeInTheDocument();
      expect(screen.queryByTestId("collection-path")).not.toBeInTheDocument();
    });

    it("should render the search bar when embedded", () => {
      const props = getProps({
        isNavBarEnabled: true,
        isCollectionPathVisible: true,
        isSearchVisible: true,
        isEmbeddingIframe: true,
        isNewButtonVisible: true,
        isLogoVisible: true,
      });

      renderWithProviders(<AppBar {...props} />);

      expect(screen.getByTestId("search-bar")).toBeInTheDocument();
      expect(screen.queryByTestId("search-button")).not.toBeInTheDocument();
    });
  });
});

const getProps = (opts?: Partial<AppBarProps>): AppBarProps => ({
  currentUser: createMockUser(),
  onToggleNavbar: jest.fn(),
  onCloseNavbar: jest.fn(),
  onLogout: jest.fn(),
  ...opts,
});

const getMediaQuery = (opts?: Partial<MediaQueryList>): MediaQueryList => ({
  media: "",
  matches: false,
  onchange: jest.fn(),
  dispatchEvent: jest.fn(),
  addListener: jest.fn(),
  addEventListener: jest.fn(),
  removeListener: jest.fn(),
  removeEventListener: jest.fn(),
  ...opts,
});
