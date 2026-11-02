import userEvent from "@testing-library/user-event";
import { type KBarQuery, useKBar } from "kbar";

import { renderWithProviders, screen } from "__support__/ui";

import {
  QuestionDisplayToggle,
  type QuestionDisplayToggleProps,
} from "./QuestionDisplayToggle";

type ProbeProps = {
  onQuery: (query: KBarQuery) => void;
};

// Renders before the toggle, so `onQuery` sees the kbar query before the
// toggle's first effect registers the shortcut.
const KBarQueryProbe = ({ onQuery }: ProbeProps) => {
  const { query } = useKBar();
  onQuery(query);
  return null;
};

const setupWithKBar = (props: QuestionDisplayToggleProps) => {
  let registerActions:
    | jest.SpiedFunction<KBarQuery["registerActions"]>
    | undefined;
  const onQuery = (query: KBarQuery) => {
    registerActions ??= jest.spyOn(query, "registerActions");
  };

  const ui = (props: QuestionDisplayToggleProps) => (
    <>
      <KBarQueryProbe onQuery={onQuery} />
      <QuestionDisplayToggle {...props} />
    </>
  );

  const { rerender } = renderWithProviders(ui(props), { withKBar: true });

  return {
    rerender: (props: QuestionDisplayToggleProps) => rerender(ui(props)),
    getRegisterActions: () => registerActions,
  };
};

// `v` is the key of the "query-builder-toggle-visualization" shortcut.
const pressToggleVisualizationKey = () => userEvent.keyboard("v");

describe("QuestionDisplayToggle", () => {
  it("renders correctly", () => {
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Switch to data")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Switch to visualization"),
    ).toBeInTheDocument();
  });

  it("toggles to data on click", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const dataButton = screen.getByLabelText("Switch to data");
    await userEvent.click(dataButton);
    expect(onToggleRawTable).toHaveBeenCalledWith(true);
  });

  it("toggles to visualization on click", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={true}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const vizButton = screen.getByLabelText("Switch to visualization");
    await userEvent.click(vizButton);
    expect(onToggleRawTable).toHaveBeenCalledWith(false);
  });

  it("toggles state on Enter key press", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={false}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const button = screen.getByLabelText("Switch to data");
    await userEvent.type(button, "{enter}");
    expect(onToggleRawTable).toHaveBeenCalledWith(true);
  });

  it("toggles state on Space key press", async () => {
    const onToggleRawTable = jest.fn();
    renderWithProviders(
      <QuestionDisplayToggle
        isShowingRawTable={true}
        onToggleRawTable={onToggleRawTable}
      />,
    );

    const button = screen.getByLabelText("Switch to visualization");
    await userEvent.type(button, " ");
    expect(onToggleRawTable).toHaveBeenCalledWith(false);
  });

  describe("keyboard shortcut", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("registers the shortcut once when the toggle renders again", () => {
      const { rerender, getRegisterActions } = setupWithKBar({
        isShowingRawTable: false,
        onToggleRawTable: () => undefined,
      });
      expect(getRegisterActions()).toHaveBeenCalledTimes(1);
      getRegisterActions()?.mockClear();

      rerender({ isShowingRawTable: false, onToggleRawTable: () => undefined });

      expect(getRegisterActions()).not.toHaveBeenCalled();
    });

    it("the shortcut uses the latest props", async () => {
      const firstOnToggleRawTable = jest.fn<void, [boolean]>();
      const latestOnToggleRawTable = jest.fn<void, [boolean]>();
      const { rerender } = setupWithKBar({
        isShowingRawTable: false,
        onToggleRawTable: firstOnToggleRawTable,
      });

      rerender({
        isShowingRawTable: true,
        onToggleRawTable: latestOnToggleRawTable,
      });
      await pressToggleVisualizationKey();

      expect(latestOnToggleRawTable).toHaveBeenCalledTimes(1);
      expect(latestOnToggleRawTable).toHaveBeenCalledWith(false);
      expect(firstOnToggleRawTable).not.toHaveBeenCalled();
    });
  });
});
