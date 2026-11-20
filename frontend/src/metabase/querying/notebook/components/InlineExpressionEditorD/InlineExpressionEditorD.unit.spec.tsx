jest.unmock("@uiw/react-codemirror");

import { currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryEndpoint,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { columnsForExpressionMode } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockDataset } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { InlineExpressionEditorD } from "./InlineExpressionEditorD";

type SetupOpts = {
  /** Opens an existing expression instead of a new one. */
  clause?: Lib.Expressionable;
};

function setup({ clause }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const stageIndex = 0;
  const onCommit = jest.fn();
  const onDone = jest.fn();
  const onDiscard = jest.fn();

  setupDatabaseEndpoints(createSampleDatabase());
  setupAdhocQueryEndpoint(createMockDataset());

  renderWithProviders(
    <InlineExpressionEditorD
      query={query}
      stageIndex={stageIndex}
      expressionMode="expression"
      availableColumns={columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "expression",
      })}
      reportTimezone="UTC"
      clause={clause}
      hasDefaultName
      onCommit={onCommit}
      onDone={onDone}
      onDiscard={onDiscard}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({ "llm-metabot-configured?": true }),
      }),
    },
  );

  return { onCommit, onDone, onDiscard };
}

const getPrompt = () => screen.getByRole("textbox", { name: "Ask AI" });
const getCodeToggle = () => screen.getByRole("button", { name: "Code" });
const getCodeElement = () =>
  screen.getByTestId("custom-expression-query-editor");

/** The code editor once it can be typed in: it formats its text when it opens. */
// The code also gets the focus a frame after a switch from the prompt.
function getCode() {
  return waitFor(() => {
    const view = EditorView.findFromDOM(
      screen.getByTestId("custom-expression-query-editor"),
    );
    if (view == null || view.state.readOnly || !view.hasFocus) {
      throw new Error("The editor isn't ready yet");
    }
    return view;
  });
}

function typeCode(view: EditorView, text: string) {
  act(() => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: text.length },
    });
  });
}

describe("InlineExpressionEditorD", () => {
  it("starts a new expression with only the AI prompt", async () => {
    setup();
    expect(await screen.findByPlaceholderText("Ask AI")).toHaveFocus();
    expect(getCodeToggle()).toHaveAttribute("aria-pressed", "false");
    expect(getCodeElement()).not.toBeVisible();
  });

  it("opens an existing expression with the prompt and the code", async () => {
    setup({ clause: Lib.expressionClause("+", [1, 2]) });
    const view = await getCode();
    await waitFor(() => expect(view.state.doc.toString()).toBe("1 + 2"));
    expect(getPrompt()).toBeVisible();
    expect(getCodeToggle()).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByTestId("expression-side-panel"),
    ).not.toBeInTheDocument();
  });

  it("opens the code and the docs with =, and goes back with Backspace", async () => {
    setup();
    await userEvent.type(getPrompt(), "=");

    const view = await getCode();
    expect(getPrompt()).toBeVisible();
    expect(view.state.doc.toString()).toBe("");
    expect(
      await screen.findByTestId("expression-side-panel"),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Backspace}");
    expect(getCodeElement()).not.toBeVisible();
    expect(getPrompt()).toHaveFocus();
    expect(
      screen.queryByTestId("expression-side-panel"),
    ).not.toBeInTheDocument();
  });

  it("hides and shows the code with f, which keeps it", async () => {
    setup();
    await userEvent.click(getCodeToggle());
    const view = await getCode();
    typeCode(view, "[Total] * 2");

    await userEvent.click(getCodeToggle());
    expect(getCodeElement()).not.toBeVisible();
    expect(getPrompt()).toHaveFocus();

    await userEvent.click(getCodeToggle());
    expect(getCodeElement()).toBeVisible();
    expect(view.state.doc.toString()).toBe("[Total] * 2");
  });

  it("asks the AI to change the code, and keeps the focus in the prompt", async () => {
    fetchMock.post("path:/api/prototype/expression/generate", {
      expression: "[Total] * 3",
    });
    // The AI gets the values of the text columns with few values.
    fetchMock.get(/\/api\/field\/\d+\/values/, { values: [], field_id: 1 });
    setup();
    await userEvent.click(getCodeToggle());
    const view = await getCode();
    typeCode(view, "[Total] * 2");

    await userEvent.type(getPrompt(), "times three{Enter}");

    await waitFor(() => expect(view.state.doc.toString()).toBe("[Total] * 3"));
    const call = fetchMock.callHistory.lastCall(
      "path:/api/prototype/expression/generate",
    );
    const body: unknown = await call?.request?.json();
    expect(body).toMatchObject({
      prompt: "times three",
      source: "[Total] * 2",
    });
    expect(getPrompt()).toHaveValue("");
    expect(getPrompt()).toHaveFocus();
    expect(
      await screen.findByTestId("expression-preview", undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
  });

  it("shows the AI's code below the prompt for a new expression", async () => {
    fetchMock.post("path:/api/prototype/expression/generate", {
      expression: "[Total] * 2",
    });
    fetchMock.get(/\/api\/field\/\d+\/values/, { values: [], field_id: 1 });
    setup();

    await userEvent.type(getPrompt(), "double the total{Enter}");

    await waitFor(() => expect(getCodeElement()).toBeVisible());
    expect(getCodeToggle()).toHaveAttribute("aria-pressed", "true");
    expect(getPrompt()).toHaveFocus();
    // The docs open only when the user opens the code.
    expect(
      screen.queryByTestId("expression-side-panel"),
    ).not.toBeInTheDocument();
  });

  it("ends the suggestions with a row that opens the docs", async () => {
    setup({ clause: Lib.expressionClause("+", [1, 2]) });
    const view = await getCode();
    typeCode(view, "conc");
    act(() => {
      startCompletion(view);
    });

    await waitFor(() => {
      const labels = currentCompletions(view.state).map(
        (option) => option.label,
      );
      expect(labels.length).toBeGreaterThan(1);
      expect(labels.at(-1)).toBe("Open the docs");
    });
    const suggestions = await screen.findByTestId(
      "custom-expression-editor-suggestions",
    );
    // CodeMirror ignores a pick within 75ms of the list opening.
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    await userEvent.click(within(suggestions).getByText("Open the docs"));
    expect(
      await screen.findByTestId("expression-side-panel"),
    ).toBeInTheDocument();
  });

  it("closes an empty new expression with Done", async () => {
    const { onDiscard, onDone } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
