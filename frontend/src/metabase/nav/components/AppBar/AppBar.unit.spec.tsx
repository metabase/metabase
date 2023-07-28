import { render, screen } from "@testing-library/react";
import { createMockUser } from "metabase-types/api/mocks";
import AppBar, { AppBarProps } from "./AppBar";

const NewItemButtonMock = () => <div data-testid="new-button" />;
const SearchBarMock = () => <div data-testid="search-bar" />;
const BreadcrumbsMock = () => <div data-testid="collection-path" />;
const QuestionLineageMock = () => <div data-testid="question-lineage" />;

jest.mock("../NewItemButton", () => NewItemButtonMock);
jest.mock("../SearchBar", () => SearchBarMock);
jest.mock("../../containers/CollectionBreadcrumbs", () => BreadcrumbsMock);
jest.mock("../../containers/QuestionLineage", () => QuestionLineageMock);

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

      render(<AppBar {...props} />);

      expect(screen.getByTestId("main-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("search-bar")).toBeInTheDocument();
      expect(screen.getByTestId("new-button")).toBeInTheDocument();
    });

    it("should render the desktop app bar for saved questions and dashboards", () => {
      const props = getProps({
        isCollectionPathVisible: true,
      });

      render(<AppBar {...props} />);

      expect(screen.getByTestId("collection-path")).toBeInTheDocument();
      expect(screen.queryByTestId("question-lineage")).not.toBeInTheDocument();
    });

    it("should render the desktop app bar for unsaved questions", () => {
      const props = getProps({
        isCollectionPathVisible: true,
        isQuestionLineageVisible: true,
      });

      render(<AppBar {...props} />);

      expect(screen.getByTestId("question-lineage")).toBeInTheDocument();
      expect(screen.queryByTestId("collection-path")).not.toBeInTheDocument();
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

      render(<AppBar {...props} />);

      expect(screen.getByTestId("main-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("search-bar")).toBeInTheDocument();
      expect(screen.queryByTestId("new-button")).not.toBeInTheDocument();
    });

    it("should render the mobile app bar for saved questions and dashboards", () => {
      const props = getProps({
        isCollectionPathVisible: true,
      });

      render(<AppBar {...props} />);

      expect(screen.getByTestId("collection-path")).toBeInTheDocument();
      expect(screen.queryByTestId("question-lineage")).not.toBeInTheDocument();
    });

    it("should render the mobile app bar for unsaved questions", () => {
      const props = getProps({
        isCollectionPathVisible: true,
        isQuestionLineageVisible: true,
      });

      render(<AppBar {...props} />);

      expect(screen.getByTestId("question-lineage")).toBeInTheDocument();
      expect(screen.queryByTestId("collection-path")).not.toBeInTheDocument();
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
