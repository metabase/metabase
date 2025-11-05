import { render, screen } from "@testing-library/react";

import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockDashboard } from "metabase-types/api/mocks";

import { SharingModals } from "./SharingModals";

jest.mock("../PublicLinkPopover", () => ({
  QuestionPublicLinkPopover: jest.fn(({ isOpen }) =>
    isOpen ? <div data-testid="question-public-link-popover" /> : null,
  ),
  DashboardPublicLinkPopover: jest.fn(({ isOpen }) =>
    isOpen ? <div data-testid="dashboard-public-link-popover" /> : null,
  ),
}));

jest.mock("metabase/query_builder/components/QuestionEmbedWidget", () => ({
  QuestionEmbedWidget: jest.fn(() => (
    <div data-testid="question-embed-widget" />
  )),
}));

jest.mock(
  "metabase/dashboard/containers/DashboardSharingEmbeddingModal",
  () => ({
    DashboardSharingEmbeddingModal: jest.fn(({ isOpen }) =>
      isOpen ? <div data-testid="dashboard-sharing-embedding-modal" /> : null,
    ),
  }),
);

describe("SharingModals", () => {
  const mockOnClose = jest.fn();
  const mockQuestion = new Question(createMockCard());
  const mockDashboard = createMockDashboard();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("with null modalType", () => {
    it("should render nothing when modalType is null", () => {
      const { container } = render(
        <SharingModals modalType={null} onClose={mockOnClose} />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("should render nothing when modalType is null with question", () => {
      const { container } = render(
        <SharingModals
          modalType={null}
          question={mockQuestion}
          onClose={mockOnClose}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("should render nothing when modalType is null with dashboard", () => {
      const { container } = render(
        <SharingModals
          modalType={null}
          dashboard={mockDashboard}
          onClose={mockOnClose}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("question modals", () => {
    it("should render QuestionPublicLinkPopover for question-public-link", () => {
      render(
        <SharingModals
          modalType="question-public-link"
          question={mockQuestion}
          onClose={mockOnClose}
        />,
      );

      expect(
        screen.getByTestId("question-public-link-popover"),
      ).toBeInTheDocument();
    });

    it("should render QuestionEmbedWidget for static-legacy", () => {
      render(
        <SharingModals
          modalType={STATIC_LEGACY_EMBEDDING_TYPE}
          question={mockQuestion}
          onClose={mockOnClose}
        />,
      );

      const widget = screen.getByTestId("question-embed-widget");
      expect(widget).toBeInTheDocument();
    });
  });

  describe("dashboard modals", () => {
    it("should render DashboardPublicLinkPopover for dashboard-public-link", () => {
      render(
        <SharingModals
          modalType="dashboard-public-link"
          dashboard={mockDashboard}
          onClose={mockOnClose}
        />,
      );

      expect(
        screen.getByTestId("dashboard-public-link-popover"),
      ).toBeInTheDocument();
    });

    it("should render DashboardSharingEmbeddingModal for static-legacy", () => {
      render(
        <SharingModals
          modalType={STATIC_LEGACY_EMBEDDING_TYPE}
          dashboard={mockDashboard}
          onClose={mockOnClose}
        />,
      );

      const modal = screen.getByTestId("dashboard-sharing-embedding-modal");
      expect(modal).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should prioritize question modal when both question and dashboard are provided", () => {
      render(
        // @ts-expect-error Testing invalid state
        <SharingModals
          modalType={STATIC_LEGACY_EMBEDDING_TYPE}
          question={mockQuestion}
          dashboard={mockDashboard}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByTestId("question-embed-widget")).toBeInTheDocument();
      expect(
        screen.queryByTestId("dashboard-sharing-embedding-modal"),
      ).not.toBeInTheDocument();
    });
  });
});
