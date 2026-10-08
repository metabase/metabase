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
const PARENT_RENDER_COUNT = 10;

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

function getControlsRow() {
  const controls = getDiffControls(screen.getByRole("textbox"));
  expect(
    within(controls.row).getByRole("button", { name: /Accept/ }),
  ).toBeInTheDocument();
  expect(
    within(controls.row).getByRole("button", { name: /Reject/ }),
  ).toBeInTheDocument();
  return controls;
}

describe("CodemirrorEditor", () => {
  it.each([
    ["an earlier line", "FROM orders", "FROM people"],
    ["the same line", "WHERE id = 1", "WHERE id = 3"],
    ["a later line", "ORDER BY id", "ORDER BY total"],
  ])(
    "keeps the buttons under a second proposal on %s",
    async (_name, before, after) => {
      const { createQuery, rerender } = setup({ text: ORIGINAL });
      rerender({
        proposedQuery: createQuery(
          ORIGINAL.replace("WHERE id = 1", "WHERE id = 2"),
        ),
      });
      expect(getControlsRow().previousLine).toHaveTextContent("WHERE id = 2");

      rerender({ proposedQuery: createQuery(ORIGINAL.replace(before, after)) });

      await waitFor(() =>
        expect(screen.getByRole("textbox")).toHaveTextContent(after),
      );
      expect(getControlsRow().previousLine).toHaveTextContent(after);
    },
  );

  it("keeps the buttons after undoing a proposal", async () => {
    const { createQuery, rerender } = setup({ text: ORIGINAL });
    rerender({
      proposedQuery: createQuery(
        ORIGINAL.replace("WHERE id = 1", "WHERE id = 2"),
      ),
    });
    expect(getControlsRow().previousLine).toHaveTextContent("WHERE id = 2");

    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveTextContent("WHERE id = 1"),
    );
    expect(getControlsRow().previousLine).toHaveTextContent("LIMIT 10");
  });

  it("keeps the editor configuration and styles stable when callbacks change", () => {
    const { rerender, onRejectProposed } = setup({
      text: ORIGINAL,
      proposedText: ORIGINAL.replace("WHERE id = 1", "WHERE id = 2"),
    });
    const styleRuleCount = () =>
      Array.from(document.styleSheets).reduce(
        (count, sheet) => count + sheet.cssRules.length,
        0,
      );
    const before = styleRuleCount();
    const reject = jest.fn();

    for (let render = 0; render < PARENT_RENDER_COUNT; render++) {
      rerender({ onRejectProposed: reject });
    }

    expect(styleRuleCount()).toBe(before);
    expect(getControlsRow().previousLine).toHaveTextContent("WHERE id = 2");
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
    expect(
      within(row).getByRole("button", { name: /Reject/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveTextContent("SELECT 2999");
    await userEvent.click(within(row).getByRole("button", { name: /Accept/ }));
    expect(onAcceptProposed).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Accept", "y", "onAcceptProposed"],
    ["Reject", "x", "onRejectProposed"],
  ] as const)(
    "shows the Windows shortcut on %s and uses it",
    (label, key, callback) => {
      const platform = jest.spyOn(Browser, "isWindows").mockReturnValue(true);
      try {
        const callbacks = setup({ text: "SELECT 1", proposedText: "SELECT 2" });
        const { row } = getControlsRow();
        expect(
          within(row).getByRole("button", { name: new RegExp(label) }),
        ).toHaveTextContent(`${label}AltShift${key.toUpperCase()}`);
        fireEvent.keyDown(screen.getByRole("textbox"), {
          key,
          code: `Key${key.toUpperCase()}`,
          keyCode: key.toUpperCase().charCodeAt(0),
          altKey: true,
          shiftKey: true,
        });
        expect(callbacks[callback]).toHaveBeenCalledTimes(1);
      } finally {
        platform.mockRestore();
      }
    },
  );

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
    ["Accept", "y", "onAcceptProposed"],
    ["Reject", "x", "onRejectProposed"],
  ] as const)(
    "resolves %s with its Ctrl+Alt shortcut",
    (label, key, callback) => {
      const callbacks = setup({ text: "SELECT 1", proposedText: "SELECT 2" });

      expect(
        screen.getByRole("button", { name: new RegExp(label) }),
      ).toHaveTextContent(`${label}CtrlAlt${key.toUpperCase()}`);

      fireEvent.keyDown(screen.getByRole("textbox"), {
        key,
        code: `Key${key.toUpperCase()}`,
        ctrlKey: true,
        altKey: true,
      });

      expect(callbacks[callback]).toHaveBeenCalledTimes(1);
      expect(callbacks.onRunQuery).not.toHaveBeenCalled();
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
