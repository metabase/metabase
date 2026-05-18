import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks/metabot";
import {
  createMockMediaQueryList,
  renderWithProviders,
  screen,
} from "__support__/ui-with-store";
import { createMockUser } from "metabase-types/api/mocks";

import type { AppBarProps } from "./AppBar";
import AppBar from "./AppBar";

jest.mock("../NewItemButton", () => () => <div data-testid="new-button" />);
jest.mock("../search/SearchBar/SearchBar", () => () => (
  <div data-testid="search-bar" />
));
jest.mock("../search/SearchButton/SearchButton", () => ({
  SearchButton: () => <div data-testid="search-button" />,
}));
jest.mock("../../containers/CollectionBreadcrumbs", () => () => (
  <div data-testid="collection-path" />
));
jest.mock("../../containers/QuestionLineage", () => () => (
  <div data-testid="question-lineage" />
));

describe("AppBar", () => {
  let matchMediaSpy: jest.SpyInstance;

  beforeEach(() => {
    setupUserMetabotPermissionsEndpoint();
    matchMediaSpy = jest.spyOn(window, "matchMedia");
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  describe("large screens", () => {
    beforeEach(() => {
      matchMediaSpy.mockReturnValue(
        createMockMediaQueryList({ matches: false }),
      );
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
      matchMediaSpy.mockReturnValue(
        createMockMediaQueryList({ matches: true }),
      );
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
  detailView: null,
  currentUser: createMockUser(),
  onToggleNavbar: jest.fn(),
  onCloseNavbar: jest.fn(),
  ...opts,
});
