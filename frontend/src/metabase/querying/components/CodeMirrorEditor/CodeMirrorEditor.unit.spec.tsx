jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Browser from "metabase/utils/browser";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type { NativeQuerySnippet } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import {
  CodeMirrorEditor,
  type CodeMirrorEditorProps,
} from "./CodeMirrorEditor";
import { getDiffControls } from "./test-utils";

const ORIGINAL =
  "SELECT *\nFROM orders\nWHERE id = 1\nGROUP BY id\nORDER BY id\nLIMIT 10";
const PROPOSED = ORIGINAL.replace("WHERE id = 1", "WHERE id = 2");

function setup({
  text = "",
  readOnly = false,
  snippets = [],
  proposedText,
}: {
  text?: string;
  readOnly?: boolean;
  snippets?: NativeQuerySnippet[];
  proposedText?: string;
} = {}) {
  const onChange = jest.fn();
  const onCursorMoveOverCardTag = jest.fn();
  const onRightClickSelection = jest.fn();
  const onSelectionChange = jest.fn();
  const onAcceptProposed = jest.fn();
  const onRejectProposed = jest.fn();
  const onRunQuery = jest.fn();

  fetchMock.get("path:/api/native-query-snippet", {
    body: snippets,
  });

  const database = createSampleDatabase();
  const metadata = createMockMetadata({
    databases: [database],
  });
  const provider = createMetadataProvider({
    databaseId: database.id,
    metadata,
  });

  const query = Lib.createTestNativeQuery(provider, { query: text });

  const props: CodeMirrorEditorProps = {
    query,
    proposedQuery:
      proposedText !== undefined
        ? Lib.createTestNativeQuery(provider, { query: proposedText })
        : undefined,
    onAcceptProposed,
    onRejectProposed,
    onRunQuery,
    onChange,
    readOnly,
    onCursorMoveOverCardTag,
    onRightClickSelection,
    onSelectionChange,
  };
  const { rerender, container } = renderWithProviders(
    <CodeMirrorEditor {...props} />,
  );

  return {
    container,
    onChange,
    onCursorMoveOverCardTag,
    onRightClickSelection,
    onSelectionChange,
    onAcceptProposed,
    onRejectProposed,
    onRunQuery,
    createQuery: (text: string) =>
      Lib.createTestNativeQuery(provider, { query: text }),
    rerender: (overrides: Partial<CodeMirrorEditorProps>) =>
      rerender(<CodeMirrorEditor {...props} {...overrides} />),
  };
}

describe("CodemirrorEditor", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["an earlier line", "FROM orders", "FROM people"],
    ["the same line", "WHERE id = 1", "WHERE id = 3"],
    ["a later line", "ORDER BY id", "ORDER BY total"],
  ])(
    "keeps the buttons under a second proposal on %s",
    async (_name, before, after) => {
      const { createQuery, rerender } = setup({ text: ORIGINAL });
      rerender({ proposedQuery: createQuery(PROPOSED) });
      expect(getDiffControls().previousLine).toHaveTextContent("WHERE id = 2");

      rerender({ proposedQuery: createQuery(ORIGINAL.replace(before, after)) });

      await waitFor(() =>
        expect(screen.getByRole("textbox")).toHaveTextContent(after),
      );
      expect(getDiffControls().previousLine).toHaveTextContent(after);
    },
  );

  it("keeps the buttons after undoing a proposal", async () => {
    const { createQuery, rerender } = setup({ text: ORIGINAL });
    rerender({ proposedQuery: createQuery(PROPOSED) });
    expect(getDiffControls().previousLine).toHaveTextContent("WHERE id = 2");

    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveTextContent("WHERE id = 1"),
    );
    expect(getDiffControls().previousLine).toHaveTextContent("LIMIT 10");
  });

  it("keeps the editor configuration and styles stable when callbacks change", () => {
    const { rerender, onRejectProposed } = setup({
      text: ORIGINAL,
      proposedText: PROPOSED,
    });
    const styleRuleCount = () =>
      Array.from(document.styleSheets).reduce(
        (count, sheet) => count + sheet.cssRules.length,
        0,
      );
    const before = styleRuleCount();
    const reject = jest.fn();

    rerender({ onRejectProposed: reject });

    expect(styleRuleCount()).toBe(before);
    expect(getDiffControls().previousLine).toHaveTextContent("WHERE id = 2");
    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "x",
      altKey: true,
      ctrlKey: true,
    });
    expect(reject).toHaveBeenCalledTimes(1);
    expect(onRejectProposed).not.toHaveBeenCalled();
  });

  it("renders working review buttons when the changed chunk is outside the viewport", async () => {
    const { container, onAcceptProposed } = setup({
      text: "SELECT 1",
      proposedText: Array.from(
        { length: 3000 },
        (_, line) => `SELECT ${line}`,
      ).join("\n"),
    });
    await screen.findByRole("button", { name: /Accept/ });
    const { row, parent } = getDiffControls(container);
    expect(parent).toHaveClass("cm-editor");
    expect(screen.getByRole("textbox")).not.toHaveTextContent("SELECT 2999");
    await userEvent.click(within(row).getByRole("button", { name: /Accept/ }));
    expect(onAcceptProposed).toHaveBeenCalledTimes(1);
  });

  it("Should render the natie query's text", () => {
    const text = "SELECT 1;";

    setup({ text });
    expect(screen.getByRole("textbox")).toHaveTextContent(text);
  });

  it.each([
    ["Accept", "onAcceptProposed"],
    ["Reject", "onRejectProposed"],
  ] as const)("resolves the proposal with %s", async (label, callback) => {
    const callbacks = setup({ text: "SELECT 1", proposedText: "SELECT 2" });

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(label) }),
    );

    expect(callbacks[callback]).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      platform: "Linux",
      isWindows: false,
      hint: "CtrlAlt",
      modifiers: { ctrlKey: true, altKey: true },
    },
    {
      platform: "Windows",
      isWindows: true,
      hint: "AltShift",
      modifiers: { altKey: true, shiftKey: true },
    },
  ])(
    "resolves the proposal with the $platform shortcuts",
    ({ isWindows, hint, modifiers }) => {
      jest.spyOn(Browser, "isWindows").mockReturnValue(isWindows);
      const { onAcceptProposed, onRejectProposed, onRunQuery } = setup({
        text: "SELECT 1",
        proposedText: "SELECT 2",
      });

      expect(screen.getByRole("button", { name: /Accept/ })).toHaveTextContent(
        `Accept${hint}Y`,
      );
      expect(screen.getByRole("button", { name: /Reject/ })).toHaveTextContent(
        `Reject${hint}X`,
      );

      fireEvent.keyDown(screen.getByRole("textbox"), {
        key: "y",
        code: "KeyY",
        ...modifiers,
      });
      expect(onAcceptProposed).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(screen.getByRole("textbox"), {
        key: "x",
        code: "KeyX",
        ...modifiers,
      });
      expect(onRejectProposed).toHaveBeenCalledTimes(1);
      expect(onRunQuery).not.toHaveBeenCalled();
    },
  );

  it("runs the query with Ctrl+Enter while reviewing a proposal", () => {
    const { onRunQuery } = setup({
      text: "SELECT 1",
      proposedText: "SELECT 2",
    });

    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Enter",
      ctrlKey: true,
    });

    expect(onRunQuery).toHaveBeenCalledTimes(1);
  });

  it("keeps read-only proposals read-only", () => {
    setup({ text: "SELECT 1", proposedText: "SELECT 2", readOnly: true });

    expect(
      screen.queryByRole("button", { name: /Accept/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reject/ }),
    ).not.toBeInTheDocument();
  });
});
