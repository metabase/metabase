import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { renderWithRegisterActionsSpy } from "__support__/kbar";

import { QuestionNotebookButton } from "./QuestionNotebookButton";

const SHORTCUT_ID = "query-builder-toggle-notebook-editor";

type QuestionNotebookButtonProps = ComponentProps<
  typeof QuestionNotebookButton
>;

type SetupOpts = {
  isShowingNotebook: boolean;
};

const setup = ({ isShowingNotebook }: SetupOpts) => {
  const setQueryBuilderMode = jest.fn<
    ReturnType<QuestionNotebookButtonProps["setQueryBuilderMode"]>,
    Parameters<QuestionNotebookButtonProps["setQueryBuilderMode"]>
  >();

  const renderButton = (isShowingNotebook: boolean) => (
    <QuestionNotebookButton
      isShowingNotebook={isShowingNotebook}
      setQueryBuilderMode={setQueryBuilderMode}
    />
  );

  const { rerender, getRegistrationsOf } = renderWithRegisterActionsSpy(
    renderButton(isShowingNotebook),
  );

  const getShortcutRegistrations = () => getRegistrationsOf(SHORTCUT_ID);

  return {
    rerender: (isShowingNotebook: boolean) =>
      rerender(renderButton(isShowingNotebook)),
    getShortcutRegistrations,
    setQueryBuilderMode,
  };
};

// `e` is the key of the "query-builder-toggle-notebook-editor" shortcut.
const pressNotebookKey = () => userEvent.keyboard("e");

describe("QuestionNotebookButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not re-register the shortcut when isShowingNotebook changes", async () => {
    const { rerender, getShortcutRegistrations, setQueryBuilderMode } = setup({
      isShowingNotebook: false,
    });
    expect(getShortcutRegistrations()).toHaveLength(1);

    rerender(true);
    await pressNotebookKey();

    expect(getShortcutRegistrations()).toHaveLength(1);
    expect(setQueryBuilderMode).toHaveBeenCalledTimes(1);
    expect(setQueryBuilderMode).toHaveBeenCalledWith("view");
  });

  it('opens the notebook when "e" is pressed in the view', async () => {
    const { setQueryBuilderMode } = setup({ isShowingNotebook: false });

    await pressNotebookKey();

    expect(setQueryBuilderMode).toHaveBeenCalledTimes(1);
    expect(setQueryBuilderMode).toHaveBeenCalledWith("notebook");
  });
});
