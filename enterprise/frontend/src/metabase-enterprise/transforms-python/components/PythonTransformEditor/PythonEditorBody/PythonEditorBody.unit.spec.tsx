import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";

import { PythonEditorBody } from "./PythonEditorBody";

type SetupOpts = {
  source?: string;
  proposedSource?: string;
  isEditMode?: boolean;
  isRunnable?: boolean;
  isRunning?: boolean;
  isDirty?: boolean;
  withDebugger?: boolean;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

function setup({
  source = "# test script",
  proposedSource,
  isEditMode = true,
  isRunnable = true,
  isRunning = false,
  isDirty = false,
  withDebugger = true,
  onAcceptProposed,
  onRejectProposed,
}: SetupOpts = {}) {
  renderWithProviders(
    <PythonEditorBody
      source={source}
      proposedSource={proposedSource}
      isEditMode={isEditMode}
      isRunnable={isRunnable}
      isRunning={isRunning}
      isDirty={isDirty}
      withDebugger={withDebugger}
      onChange={jest.fn()}
      onRun={jest.fn()}
      onCancel={jest.fn()}
      onAcceptProposed={onAcceptProposed}
      onRejectProposed={onRejectProposed}
    />,
  );
}

describe("PythonEditorBody", () => {
  describe("view mode (not editing)", () => {
    it("should not render run button when not in edit mode", () => {
      setup({ isEditMode: false });
      expect(screen.queryByTestId("run-button")).not.toBeInTheDocument();
    });

    it("should not render proposed changes buttons when not in edit mode", () => {
      setup({
        isEditMode: false,
        proposedSource: "# proposed",
        onAcceptProposed: jest.fn(),
        onRejectProposed: jest.fn(),
      });

      expect(
        screen.queryByTestId("accept-proposed-changes-button"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("reject-proposed-changes-button"),
      ).not.toBeInTheDocument();
    });

    it("should render the python editor", () => {
      setup({ isEditMode: false });
      expect(screen.getByTestId("python-editor")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should render run button in edit mode", () => {
      setup({ isEditMode: true });
      expect(screen.getByTestId("run-button")).toBeInTheDocument();
    });

    it("should render proposed changes buttons when proposedSource and callbacks are provided", () => {
      setup({
        isEditMode: true,
        proposedSource: "# proposed changes",
        onAcceptProposed: jest.fn(),
        onRejectProposed: jest.fn(),
      });

      expect(
        screen.getByTestId("accept-proposed-changes-button"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("reject-proposed-changes-button"),
      ).toBeInTheDocument();
    });

    it("should not render proposed changes buttons when proposedSource is not provided", () => {
      setup({ isEditMode: true });

      expect(
        screen.queryByTestId("accept-proposed-changes-button"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("reject-proposed-changes-button"),
      ).not.toBeInTheDocument();
    });

    it("should render the python editor", () => {
      setup({ isEditMode: true });
      expect(screen.getByTestId("python-editor")).toBeInTheDocument();
    });
  });
});
