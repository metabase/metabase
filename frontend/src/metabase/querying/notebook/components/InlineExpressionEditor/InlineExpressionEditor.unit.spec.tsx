jest.unmock("@uiw/react-codemirror");

import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";

import {
  setupAdhocQueryEndpoint,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { columnsForExpressionMode } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockDataset } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { InlineExpressionEditor } from "./InlineExpressionEditor";

function setup() {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const stageIndex = 0;
  const onCommit = jest.fn();
  const onDone = jest.fn();
  const onDiscard = jest.fn();

  setupDatabaseEndpoints(createSampleDatabase());
  setupAdhocQueryEndpoint(createMockDataset());

  renderWithProviders(
    <InlineExpressionEditor
      query={query}
      stageIndex={stageIndex}
      expressionMode="expression"
      availableColumns={columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "expression",
      })}
      reportTimezone="UTC"
      hasDefaultName
      onCommit={onCommit}
      onDone={onDone}
      onDiscard={onDiscard}
    />,
  );

  return { onCommit, onDone, onDiscard };
}

/** The editor once it can be typed in: it formats its text when it opens. */
function getEditor() {
  return waitFor(() => {
    const view = EditorView.findFromDOM(
      screen.getByTestId("custom-expression-query-editor"),
    );
    if (view == null || view.state.readOnly) {
      throw new Error("The editor isn't ready yet");
    }
    return view;
  });
}

function typeText(view: EditorView, text: string) {
  act(() => {
    view.dispatch({ changes: { from: 0, insert: text } });
  });
}

function pressEnter(view: EditorView) {
  fireEvent.keyDown(view.contentDOM, { key: "Enter" });
}

describe("InlineExpressionEditor > Enter", () => {
  it("saves and keeps the editor open, with the text tidied", async () => {
    const { onCommit, onDone } = setup();
    const view = await getEditor();

    typeText(view, "subtotal + total");
    pressEnter(view);

    await waitFor(() =>
      expect(view.state.doc.toString()).toBe("[Subtotal] + [Total]"),
    );
    expect(onCommit).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("keeps a text that isn't valid as it is and shows its error", async () => {
    const { onDone } = setup();
    const view = await getEditor();

    typeText(view, "[Total] +");
    pressEnter(view);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(view.state.doc.toString()).toBe("[Total] +");
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("InlineExpressionEditor > preview", () => {
  it("shows the preview with Cmd+Enter, and hides it with Cmd+Enter again", async () => {
    setup();
    const view = await getEditor();
    typeText(view, "[Total] + 1");

    fireEvent.keyDown(view.contentDOM, { key: "Enter", metaKey: true });
    expect(await screen.findByTestId("expression-preview")).toBeInTheDocument();

    fireEvent.keyDown(view.contentDOM, { key: "Enter", metaKey: true });
    expect(screen.queryByTestId("expression-preview")).not.toBeInTheDocument();
  });

  it("hides the preview with the Preview button when it shows", async () => {
    setup();
    const view = await getEditor();
    typeText(view, "[Total] + 1");

    await userEvent.click(
      screen.getByRole("button", { name: /Preview column/ }),
    );
    expect(await screen.findByTestId("expression-preview")).toBeInTheDocument();

    const hideButton = screen.getByRole("button", { name: /Hide preview/ });
    expect(hideButton).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hideButton);
    expect(screen.queryByTestId("expression-preview")).not.toBeInTheDocument();
  });
});
