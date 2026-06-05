import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import {
  createMockMediaQueryList,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { AppBar, type AppBarProps } from "./AppBar";

function NewItemButtonMock() {
  return <div data-testid="new-button" />;
}

function SearchBarMock() {
  return <div data-testid="search-bar" />;
}

function SearchButton() {
  return <div data-testid="search-button" />;
}

function BreadcrumbsMock() {
  return <div data-testid="collection-path" />;
}

function QuestionLineageMock() {
  return <div data-testid="question-lineage" />;
}

jest.mock("../NewItemButton", () => NewItemButtonMock);
jest.mock("../search/SearchBar/SearchBar", () => SearchBarMock);
jest.mock("../search/SearchButton/SearchButton", () => ({ SearchButton }));

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
  collectionBreadcrumbs: <BreadcrumbsMock />,
  questionLineage: <QuestionLineageMock />,
  onToggleNavbar: jest.fn(),
  onCloseNavbar: jest.fn(),
  ...opts,
});
