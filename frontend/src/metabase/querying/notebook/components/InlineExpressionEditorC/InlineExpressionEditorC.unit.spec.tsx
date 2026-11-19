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

import { InlineExpressionEditorC } from "./InlineExpressionEditorC";

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
    <InlineExpressionEditorC
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

const getPrompt = (name = "Ask AI") => screen.getByRole("textbox", { name });
const queryPrompt = () => screen.queryByRole("textbox", { name: "Ask AI" });
const getModeButton = () =>
  screen.getByRole("button", { name: /^(Ask AI|Custom expression)$/ });

/** Picks a mode in the menu of the round button. */
async function chooseMode(name: string) {
  await userEvent.click(getModeButton());
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}

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

describe("InlineExpressionEditorC", () => {
  it("starts a new expression with the AI prompt", async () => {
    setup();
    expect(await screen.findByPlaceholderText("Ask AI")).toHaveFocus();
    expect(getModeButton()).toHaveAccessibleName("Ask AI");
  });

  it("opens an existing expression as code", async () => {
    setup({ clause: Lib.expressionClause("+", [1, 2]) });
    const view = await getCode();
    await waitFor(() => expect(view.state.doc.toString()).toBe("1 + 2"));
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(getModeButton()).toHaveAccessibleName("Custom expression");
  });

  it("switches to the code with = and back to the prompt with Backspace", async () => {
    setup();
    await userEvent.type(getPrompt(), "=");

    expect(queryPrompt()).not.toBeInTheDocument();
    const view = await getCode();
    expect(view.state.doc.toString()).toBe("");

    await userEvent.keyboard("{Backspace}");
    expect(getPrompt()).toBeInTheDocument();
  });

  it("keeps a pasted formula that starts with = as a prompt", async () => {
    setup();
    await userEvent.click(getPrompt());
    await userEvent.paste("=IF(A1 > 0, 1, 0)");
    expect(getPrompt()).toHaveValue("=IF(A1 > 0, 1, 0)");
  });

  it("switches the modes from the menu, with the code as context for the AI", async () => {
    setup();
    await chooseMode("Custom expression");
    const view = await getCode();
    typeCode(view, "[Total] * 2");

    await chooseMode("Ask AI");
    expect(getPrompt()).toBeInTheDocument();
    expect(await screen.findByText("[Total]")).toBeInTheDocument();

    await chooseMode("Custom expression");
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(view.state.doc.toString()).toBe("[Total] * 2");
  });

  it("starts over when the context is removed", async () => {
    setup();
    await chooseMode("Custom expression");
    const view = await getCode();
    typeCode(view, "[Total] * 2");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByTestId("expression-preview")).toBeInTheDocument();

    await chooseMode("Ask AI");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove the expression" }),
    );

    expect(screen.queryByText("[Total]")).not.toBeInTheDocument();
    expect(screen.queryByTestId("expression-preview")).not.toBeInTheDocument();
    await chooseMode("Custom expression");
    expect(view.state.doc.toString()).toBe("");
  });

  it("takes code to convert in a code font, where = is part of the code", async () => {
    setup();
    await chooseMode("Custom expression");
    typeCode(await getCode(), "[Total] * 2");
    await chooseMode("Excel");

    const prompt = getPrompt("Convert Excel to custom expression");
    await userEvent.type(prompt, "=A1*2");
    expect(prompt).toHaveValue("=A1*2");
    // Code to convert starts over, without the code as context.
    expect(
      screen.queryByRole("button", { name: "Remove the expression" }),
    ).not.toBeInTheDocument();
  });

  it("sends code to convert as the expression for the AI to convert", async () => {
    fetchMock.post("path:/api/prototype/expression/generate", {
      expression: "[Total] * 2",
    });
    fetchMock.get(/\/api\/field\/\d+\/values/, { values: [], field_id: 1 });
    setup();
    await chooseMode("SQL");

    await userEvent.type(
      getPrompt("Convert SQL to custom expression"),
      "TOTAL * 2{Enter}",
    );

    const view = await getCode();
    await waitFor(() => expect(view.state.doc.toString()).toBe("[Total] * 2"));
    const call = fetchMock.callHistory.lastCall(
      "path:/api/prototype/expression/generate",
    );
    const body: unknown = await call?.request?.json();
    expect(body).toMatchObject({
      source: "TOTAL * 2",
      prompt: expect.stringContaining("SQL"),
    });
  });

  it("ends the suggestions with a row that opens the docs", async () => {
    setup();
    await chooseMode("Custom expression");
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

  it("puts the AI's expression in the code and shows the preview", async () => {
    fetchMock.post("path:/api/prototype/expression/generate", {
      expression: "[Total] * 2",
      name: "Double total",
    });
    // The AI gets the values of the text columns with few values.
    fetchMock.get(/\/api\/field\/\d+\/values/, { values: [], field_id: 1 });
    setup();

    await userEvent.type(getPrompt(), "double the total{Enter}");

    const view = await getCode();
    await waitFor(() => expect(view.state.doc.toString()).toBe("[Total] * 2"));
    expect(queryPrompt()).not.toBeInTheDocument();
    expect(
      await screen.findByTestId("expression-preview", undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
  });

  it("closes an empty new expression with Done", async () => {
    const { onDiscard, onDone } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
