import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";

import { PythonEditorBody } from "./PythonEditorBody";

type SetupOpts = {
  source?: string;
  proposedSource?: string;
  readOnly?: boolean;
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
  readOnly = false,
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
      readOnly={readOnly}
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
  describe("read-only mode", () => {
    it("should not render run button when readOnly is true", () => {
      setup({ readOnly: true });
      expect(screen.queryByTestId("run-button")).not.toBeInTheDocument();
    });

    it("should not render proposed changes buttons when readOnly is true", () => {
      setup({
        readOnly: true,
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
      setup({ readOnly: true });
      expect(screen.getByTestId("python-editor")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should render run button when readOnly is false", () => {
      setup({ readOnly: false });
      expect(screen.getByTestId("run-button")).toBeInTheDocument();
    });

    it("should render proposed changes buttons when proposedSource and callbacks are provided", () => {
      setup({
        readOnly: false,
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
      setup({ readOnly: false });

      expect(
        screen.queryByTestId("accept-proposed-changes-button"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("reject-proposed-changes-button"),
      ).not.toBeInTheDocument();
    });

    it("should render the python editor", () => {
      setup({ readOnly: false });
      expect(screen.getByTestId("python-editor")).toBeInTheDocument();
    });
  });
});
