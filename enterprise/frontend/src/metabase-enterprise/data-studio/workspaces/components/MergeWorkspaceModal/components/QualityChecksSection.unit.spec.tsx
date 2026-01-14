import fetchMock from "fetch-mock";

import { setupWorkspaceProblemsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { WorkspaceId, WorkspaceProblem } from "metabase-types/api";
import { createMockWorkspaceProblem } from "metabase-types/api/mocks";

import { QualityChecksSection } from "./QualityChecksSection";

const MOCK_WORKSPACE_ID: WorkspaceId = 1;

describe("QualityChecksSection", () => {
  it("should render all check categories", () => {
    setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, []);
    renderWithProviders(
      <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
    );

    expect(screen.getByText("External dependencies")).toBeInTheDocument();
    expect(screen.getByText("Internal dependencies")).toBeInTheDocument();
    expect(screen.getByText("Structural issues")).toBeInTheDocument();
    expect(screen.getByText("Unused outputs")).toBeInTheDocument();
  });

  it("should show loading state while fetching problems", async () => {
    // Use a delayed promise to simulate loading
    let resolvePromise: (value: WorkspaceProblem[]) => void;
    const delayedPromise = new Promise<WorkspaceProblem[]>((resolve) => {
      resolvePromise = resolve;
    });

    fetchMock.get(
      `path:/api/ee/workspace/${MOCK_WORKSPACE_ID}/problem`,
      delayedPromise,
    );

    renderWithProviders(
      <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
    );

    // Check for loader elements (Mantine Loader renders as span with class)
    // We can't use querySelector directly, so we check that "Passed" is not yet visible
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();

    // Resolve the promise to clean up
    resolvePromise!([]);
  });

  it("should show 'Passed' status when there are no problems", async () => {
    setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, []);
    renderWithProviders(
      <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
    );

    await waitFor(() => {
      const passedTexts = screen.getAllByText("Passed");
      expect(passedTexts.length).toBe(4); // All 4 categories should pass
    });
  });

  it("should show check icon for passed checks", async () => {
    setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, []);
    renderWithProviders(
      <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
    );

    await waitFor(() => {
      const checkIcons = screen.getAllByLabelText("check icon");
      expect(checkIcons.length).toBe(4); // All 4 categories should have check icons
    });
  });

  describe("External dependencies", () => {
    it("should display failed status when there are external dependency problems", async () => {
      const problems: WorkspaceProblem[] = [
        createMockWorkspaceProblem({
          category: "external-downstream",
          problem: "not-run",
          severity: "error",
          description: "External transform depends on this",
        }),
      ];

      setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, problems);
      renderWithProviders(
        <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Failed")).toBeInTheDocument();
      });
    });

    it("should display issue count when there are multiple external dependency problems", async () => {
      const problems: WorkspaceProblem[] = [
        createMockWorkspaceProblem({
          category: "external-downstream",
          problem: "not-run",
          severity: "error",
          description: "External transform 1 depends on this",
        }),
        createMockWorkspaceProblem({
          category: "external-downstream",
          problem: "not-run",
          severity: "warning",
          description: "External transform 2 depends on this",
        }),
      ];

      setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, problems);
      renderWithProviders(
        <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
      );

      await waitFor(() => {
        expect(screen.getByText("2 issues")).toBeInTheDocument();
      });
    });
  });

  describe("Internal dependencies", () => {
    it("should display failed status when there are internal dependency problems", async () => {
      const problems: WorkspaceProblem[] = [
        createMockWorkspaceProblem({
          category: "internal-downstream",
          problem: "not-run",
          severity: "error",
          description: "Internal transform depends on this",
        }),
      ];

      setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, problems);
      renderWithProviders(
        <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Failed")).toBeInTheDocument();
      });
    });
  });

  describe("Structural issues", () => {
    it("should display failed status for internal structural issues", async () => {
      const problems: WorkspaceProblem[] = [
        createMockWorkspaceProblem({
          category: "internal",
          problem: "removed-field",
          severity: "error",
          description: "Field was removed",
        }),
      ];

      setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, problems);
      renderWithProviders(
        <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Failed")).toBeInTheDocument();
      });
    });

    it("should display failed status for external structural issues", async () => {
      const problems: WorkspaceProblem[] = [
        createMockWorkspaceProblem({
          category: "external",
          problem: "removed-field",
          severity: "error",
          description: "External field was removed",
        }),
      ];

      setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, problems);
      renderWithProviders(
        <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Failed")).toBeInTheDocument();
      });
    });
  });

  describe("Multiple categories with problems", () => {
    it("should display problems from multiple categories", async () => {
      const problems: WorkspaceProblem[] = [
        createMockWorkspaceProblem({
          category: "external-downstream",
          problem: "not-run",
          severity: "error",
          description: "External dependency issue",
        }),
        createMockWorkspaceProblem({
          category: "internal",
          problem: "removed-field",
          severity: "warning",
          description: "Structural issue",
        }),
        createMockWorkspaceProblem({
          category: "unused",
          problem: "not-run",
          severity: "info",
          description: "Unused output",
        }),
      ];

      setupWorkspaceProblemsEndpoint(MOCK_WORKSPACE_ID, problems);
      renderWithProviders(
        <QualityChecksSection workspaceId={MOCK_WORKSPACE_ID} />,
      );

      await waitFor(() => {
        // There should be multiple "Failed" texts (external dependencies and structural issues)
        const failedTexts = screen.getAllByText("Failed");
        expect(failedTexts.length).toBeGreaterThanOrEqual(2);
      });

      expect(screen.getByText("1 info")).toBeInTheDocument();
    });
  });
});
