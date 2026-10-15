import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";

import { PythonEditorBody } from "./PythonEditorBody";

type SetupOpts = {
  source?: string;
  isEditMode?: boolean;
  isRunnable?: boolean;
  isRunning?: boolean;
  isDirty?: boolean;
  withDebugger?: boolean;
};

function setup({
  source = "# test script",
  isEditMode = true,
  isRunnable = true,
  isRunning = false,
  isDirty = false,
  withDebugger = true,
}: SetupOpts = {}) {
  renderWithProviders(
    <PythonEditorBody
      source={source}
      isEditMode={isEditMode}
      isRunnable={isRunnable}
      isRunning={isRunning}
      isDirty={isDirty}
      withDebugger={withDebugger}
      onChange={jest.fn()}
      onRun={jest.fn()}
      onCancel={jest.fn()}
    />,
  );
}

describe("PythonEditorBody", () => {
  describe("view mode (not editing)", () => {
    it("should not render run button when not in edit mode", () => {
      setup({ isEditMode: false });
      expect(screen.queryByTestId("run-button")).not.toBeInTheDocument();
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

    it("should render the python editor", () => {
      setup({ isEditMode: true });
      expect(screen.getByTestId("python-editor")).toBeInTheDocument();
    });
  });
});
