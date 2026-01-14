import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";

import { PythonEditorBody } from "./PythonEditorBody";

// Mock matchMedia to include matches property
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock the PythonEditor component since it requires complex setup
jest.mock("../../PythonEditor", () => ({
  PythonEditor: () => <div data-testid="python-editor-mock">Python Editor</div>,
}));

// Mock ResizableBox since it has complex behavior
jest.mock("react-resizable", () => ({
  ResizableBox: ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div data-testid="resizable-box">{children}</div>,
}));

// Mock the ResizableBoxHandle
jest.mock("./ResizableBoxHandle", () => ({
  ResizableBoxHandle: () => <div data-testid="resize-handle" />,
}));

// Mock react-use hooks
jest.mock("react-use", () => ({
  ...jest.requireActual("react-use"),
  useWindowSize: () => ({ height: 800, width: 1200 }),
}));

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
  const onChange = jest.fn();
  const onRun = jest.fn();
  const onCancel = jest.fn();

  renderWithProviders(
    <PythonEditorBody
      source={source}
      proposedSource={proposedSource}
      readOnly={readOnly}
      isRunnable={isRunnable}
      isRunning={isRunning}
      isDirty={isDirty}
      withDebugger={withDebugger}
      onChange={onChange}
      onRun={onRun}
      onCancel={onCancel}
      onAcceptProposed={onAcceptProposed}
      onRejectProposed={onRejectProposed}
    />,
  );

  return { onChange, onRun, onCancel };
}

describe("PythonEditorBody", () => {
  describe("read-only mode", () => {
    it("should not render run button when readOnly is true", () => {
      setup({ readOnly: true });
      expect(screen.queryByTestId("run-button")).not.toBeInTheDocument();
    });

    it("should not render proposed changes buttons when readOnly is true", () => {
      const onAccept = jest.fn();
      const onReject = jest.fn();
      setup({
        readOnly: true,
        proposedSource: "# proposed",
        onAcceptProposed: onAccept,
        onRejectProposed: onReject,
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
      expect(screen.getByTestId("python-editor-mock")).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("should render run button when readOnly is false", () => {
      setup({ readOnly: false });
      expect(screen.getByTestId("run-button")).toBeInTheDocument();
    });

    it("should render proposed changes buttons when proposedSource and callbacks are provided", () => {
      const onAccept = jest.fn();
      const onReject = jest.fn();
      setup({
        readOnly: false,
        proposedSource: "# proposed changes",
        onAcceptProposed: onAccept,
        onRejectProposed: onReject,
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
      expect(screen.getByTestId("python-editor-mock")).toBeInTheDocument();
    });
  });
});
