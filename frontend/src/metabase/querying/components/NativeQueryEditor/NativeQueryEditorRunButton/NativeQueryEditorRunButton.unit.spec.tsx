import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";

import { NativeQueryEditorRunButton } from "./NativeQueryEditorRunButton";

const UNMAPPED_TAG_ERROR =
  'The variable "my_filter" needs to be mapped to a field.';

interface SetupOpts {
  isRunnable?: boolean;
  nativeEditorSelectedText?: string | null;
  questionErrors?: Lib.ValidationError[] | null;
}

function setup({
  isRunnable = true,
  nativeEditorSelectedText = null,
  questionErrors = null,
}: SetupOpts = {}) {
  const runQuery = jest.fn();

  renderWithProviders(
    <NativeQueryEditorRunButton
      cancelQuery={jest.fn()}
      isResultDirty
      isRunnable={isRunnable}
      isRunning={false}
      nativeEditorSelectedText={nativeEditorSelectedText}
      questionErrors={questionErrors}
      runQuery={runQuery}
    />,
  );

  return { runQuery };
}

function getRunButton() {
  return screen.getByTestId("run-button");
}

describe("NativeQueryEditorRunButton", () => {
  it("should explain why the query cannot run when a template tag is not mapped to a field", async () => {
    const { runQuery } = setup({
      isRunnable: false,
      questionErrors: [{ message: UNMAPPED_TAG_ERROR }],
    });

    expect(getRunButton()).toBeDisabled();

    await userEvent.hover(getRunButton(), {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      UNMAPPED_TAG_ERROR,
    );

    await userEvent.click(getRunButton(), {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it("should show only the first error when there are several", async () => {
    setup({
      isRunnable: false,
      questionErrors: [
        { message: UNMAPPED_TAG_ERROR },
        { message: "Missing widget label: my_filter" },
      ],
    });

    await userEvent.hover(getRunButton(), {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(UNMAPPED_TAG_ERROR);
    expect(tooltip).not.toHaveTextContent("Missing widget label");
  });

  it("should show the run shortcut and run the query when there are no errors", async () => {
    const { runQuery } = setup({ questionErrors: [] });

    expect(getRunButton()).toBeEnabled();

    await userEvent.hover(getRunButton());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Run query");

    await userEvent.click(getRunButton());
    expect(runQuery).toHaveBeenCalled();
  });

  it("should offer to run the selection when there is selected text", async () => {
    setup({ nativeEditorSelectedText: "select 1" });

    await userEvent.hover(getRunButton());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Run selected text",
    );
  });
});
