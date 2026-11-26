import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import type { EditorProps } from "@tiptap/pm/view";
import { type Ref, createRef, useImperativeHandle, useState } from "react";

import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";

import {
  MOCK_ADAPTER,
  type MockFilter,
  and,
  leaf,
  mockExpression,
  mockFilter,
  mockSegment,
  or,
} from "../../test-utils";
import type {
  FilterBarAdapter,
  FilterEditorProps,
  FilterStages,
} from "../../types";

import { FilterBar } from "./FilterBar";

const renderMockFilterEditor = ({
  onChange,
  onClose,
}: FilterEditorProps<MockFilter>) => (
  <>
    <button
      type="button"
      onClick={() => onChange({ type: "segment", name: "Big orders" })}
    >
      Apply
    </button>
    <button type="button" onClick={onClose}>
      Close
    </button>
  </>
);

const ADAPTER: FilterBarAdapter<MockFilter> = {
  stage: (stage) => ({
    ...MOCK_ADAPTER.stage(stage),
    renderFilterEditor: renderMockFilterEditor,
  }),
};

type Stages = FilterStages<MockFilter>;

type HostHandle = {
  setValue: (value: Stages) => void;
};

type HostProps = {
  initialValue: Stages;
  autoFocus?: boolean;
  onChange: (value: Stages) => void;
};

const Host = ({
  initialValue,
  autoFocus,
  onChange,
  ref,
}: HostProps & { ref: Ref<HostHandle> }) => {
  const [value, setValue] = useState(initialValue);
  useImperativeHandle(ref, () => ({ setValue }));
  return (
    <FilterBar
      value={value}
      adapter={ADAPTER}
      autoFocus={autoFocus}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
};

type SetupOpts = {
  value?: Stages;
  autoFocus?: boolean;
};

const setup = async ({ value = [], autoFocus }: SetupOpts = {}) => {
  const onChange = jest.fn<void, [Stages]>();
  const ref = createRef<HostHandle>();
  renderWithProviders(
    <Host
      ref={ref}
      initialValue={value}
      autoFocus={autoFocus}
      onChange={onChange}
    />,
  );
  await act(() => Promise.resolve());
  const sendValue = (next: Stages) =>
    act(async () => ref.current?.setValue(next));
  return { onChange, sendValue };
};

const getEditor = () =>
  screen.getByText(
    (_, element) => element?.getAttribute("contenteditable") === "true",
  );

const getErrorElements = () =>
  screen.queryAllByText(
    (_, element) => element?.hasAttribute("data-error") === true,
  );

const getTiptapEditor = () => {
  const element = getEditor();
  return "editor" in element && element.editor instanceof Editor
    ? element.editor
    : null;
};

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const typeText = async (text: string) => {
  act(() => {
    const editor = getTiptapEditor();
    if (!editor) {
      return;
    }
    const { view } = editor;
    const { from, to } = view.state.selection;
    const isHandled = view.someProp(
      "handleTextInput",
      (handle: NonNullable<EditorProps["handleTextInput"]>) =>
        handle(view, from, to, text, () => view.state.tr),
    );
    if (!isHandled) {
      view.dispatch(view.state.tr.insertText(text, from, to));
    }
  });
  await flush();
};

const click = (element: Element) => userEvent.click(element);

const focusBar = () => click(getEditor());

const blur = () => click(document.body);

const getPillTexts = () =>
  screen.queryAllByTestId("filter-pill").map((pill) => pill.textContent);

describe("FilterBar", () => {
  describe("pills", () => {
    it("shows a comparison operator by its key", async () => {
      await setup({ value: [leaf(mockFilter("id", ">=", "10"))] });

      expect(getPillTexts()).toEqual(["ID>=10"]);
    });

    it("shows other operators by their label", async () => {
      await setup({ value: [leaf(mockFilter("status", "=", "paid"))] });

      expect(getPillTexts()).toEqual(["Statusispaid"]);
    });

    it("shows the two values of a range apart", async () => {
      await setup({
        value: [leaf(mockFilter("subtotal", "between", "20", "100"))],
      });

      expect(getPillTexts()).toEqual(["Subtotalis between20and100"]);
    });

    it("shows three values and the number of the rest", async () => {
      await setup({
        value: [leaf(mockFilter("state", "=", "CA", "NY", "TX", "WA", "OR"))],
      });

      expect(getPillTexts()).toEqual(["StateisCA, NY, TX, ...+2"]);
    });

    it("shows no values for an operator without values", async () => {
      await setup({ value: [leaf(mockFilter("status", "is-empty"))] });

      expect(getPillTexts()).toEqual(["Statusis empty"]);
    });

    it("shows an opaque pill by its name", async () => {
      await setup({ value: [leaf(mockSegment("Active users"))] });

      expect(getPillTexts()).toEqual(["Active users"]);
    });

    it("shows a custom expression as its text", async () => {
      await setup({ value: [leaf(mockExpression("[Subtotal] > 10"))] });

      expect(getPillTexts()).toEqual(["[Subtotal] > 10"]);
    });

    it("hides the and without an or", async () => {
      await setup({
        value: [
          and(
            leaf(mockFilter("count", ">", "5")),
            leaf(mockFilter("count", "<", "10")),
          ),
        ],
      });

      expect(screen.queryByText("and")).not.toBeInTheDocument();
      expect(getPillTexts()).toEqual(["Count>5", "Count<10"]);
    });

    it("shows every connector and the parentheses once there is an or", async () => {
      await setup({
        value: [
          and(
            leaf(mockFilter("id", "=", "1")),
            or(
              leaf(mockFilter("id", "=", "2")),
              leaf(mockFilter("id", "=", "3")),
              leaf(mockFilter("id", "=", "4")),
            ),
          ),
        ],
      });

      expect(screen.getByText("and")).toBeInTheDocument();
      expect(screen.getAllByText("or")).toHaveLength(2);
      expect(within(getEditor()).getByText("(")).toBeInTheDocument();
      expect(screen.getByText(")")).toBeInTheDocument();
    });
  });

  describe("clear", () => {
    it("clears all filters", async () => {
      const { onChange } = await setup({
        value: [leaf(mockFilter("id", "=", "1"))],
      });

      await userEvent.click(screen.getByLabelText("Clear all filters"));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([]);
      expect(getPillTexts()).toEqual([]);
      expect(
        screen.queryByLabelText("Clear all filters"),
      ).not.toBeInTheDocument();
    });

    it.each<[string, Stages]>([
      ["no stages", []],
      ["only empty stages", [and(), and()]],
    ])("has no clear button with %s", async (_, value) => {
      await setup({ value });

      expect(
        screen.queryByLabelText("Clear all filters"),
      ).not.toBeInTheDocument();
    });
  });

  describe("host value", () => {
    it("shows new stages from the host without calling onChange", async () => {
      const { onChange, sendValue } = await setup({
        value: [leaf(mockFilter("id", "=", "1"))],
      });

      await sendValue([leaf(mockSegment("Active users"))]);

      expect(getPillTexts()).toEqual(["Active users"]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps the pills when the host echoes the same stages", async () => {
      const { onChange, sendValue } = await setup({
        value: [leaf(mockFilter("id", "=", "1"))],
      });
      const pill = screen.getByTestId("filter-pill");

      await sendValue([leaf(mockFilter("id", "=", "1"))]);

      expect(screen.getByTestId("filter-pill")).toBe(pill);
      expect(getPillTexts()).toEqual(["IDis1"]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("editing", () => {
    it("calls onChange once with the rest when a pill is removed", async () => {
      const { onChange } = await setup({
        value: [
          and(
            leaf(mockFilter("id", "=", "1")),
            leaf(mockSegment("Active users")),
          ),
        ],
      });

      await userEvent.click(screen.getAllByLabelText("Remove filter")[0]);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([
        leaf(mockSegment("Active users")),
      ]);
      expect(getPillTexts()).toEqual(["Active users"]);
    });

    it("does not call onChange while a filter is being typed", async () => {
      const { onChange } = await setup();

      await focusBar();
      await typeText("sub");

      expect(onChange).not.toHaveBeenCalled();
    });

    it("does not call onChange for an invalid document", async () => {
      const { onChange } = await setup({
        value: [leaf(mockSegment("Active users"))],
      });

      await focusBar();
      await typeText("(");

      expect(within(getEditor()).getByText("(")).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("errors", () => {
    const typeError = async () => {
      await focusBar();
      await typeText(")");
    };

    it("hides an error while typing and shows it on blur", async () => {
      await setup({ value: [leaf(mockSegment("Active users"))] });

      await typeError();

      expect(
        screen.queryByText("Unexpected closing parenthesis"),
      ).not.toBeInTheDocument();
      expect(getErrorElements()).toHaveLength(0);

      await blur();

      expect(
        screen.getByText("Unexpected closing parenthesis"),
      ).toBeInTheDocument();
      expect(getErrorElements()).toHaveLength(1);
      expect(getErrorElements()[0]).toHaveTextContent(")");
    });

    it("hides a shown error when the host sends new stages", async () => {
      const { sendValue } = await setup({
        value: [leaf(mockSegment("Active users"))],
      });
      await typeError();
      await blur();

      await sendValue([leaf(mockFilter("id", "=", "1"))]);

      expect(
        screen.queryByText("Unexpected closing parenthesis"),
      ).not.toBeInTheDocument();
      expect(getPillTexts()).toEqual(["IDis1"]);
    });
  });

  describe("filter editor", () => {
    const openFilterEditor = async () => {
      await focusBar();
      await click(screen.getByText("Created At"));
    };

    it("opens in place of the column list for a column without operators", async () => {
      await setup();

      await openFilterEditor();

      expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("places the applied filter and calls onChange", async () => {
      const { onChange } = await setup();
      await openFilterEditor();

      await click(screen.getByRole("button", { name: "Apply" }));

      expect(getPillTexts()).toEqual(["Big orders"]);
      expect(onChange).toHaveBeenCalledWith([leaf(mockSegment("Big orders"))]);
      expect(
        screen.queryByRole("button", { name: "Apply" }),
      ).not.toBeInTheDocument();
    });

    it("closes without a change", async () => {
      const { onChange } = await setup();
      await openFilterEditor();

      await click(screen.getByRole("button", { name: "Close" }));

      expect(
        screen.queryByRole("button", { name: "Apply" }),
      ).not.toBeInTheDocument();
      expect(getPillTexts()).toEqual([]);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("caret popup", () => {
    it("shows the column groups when the bar is clicked", async () => {
      await setup();

      await focusBar();

      expect(screen.getByText("Orders")).toBeInTheDocument();
      expect(screen.getByText("Active users")).toBeInTheDocument();
      expect(screen.getByText("Summaries")).toBeInTheDocument();
      expect(screen.getByText("Count")).toBeInTheDocument();
    });

    it("filters the columns by the typed text", async () => {
      await setup();
      await focusBar();

      await typeText("sub");

      expect(screen.getByText("Subtotal")).toBeInTheDocument();
      expect(screen.queryByText("Status")).not.toBeInTheDocument();
      expect(screen.queryByText("Summaries")).not.toBeInTheDocument();
    });

    it.each(["{Enter}", "{Tab}"])(
      "goes to the operators when %s picks a column",
      async (key) => {
        await setup();
        await focusBar();
        await typeText("sub");

        await userEvent.keyboard(key);

        expect(screen.getByText("is between")).toBeInTheDocument();
        expect(screen.queryByText("Orders")).not.toBeInTheDocument();
      },
    );

    it("collapses a group when its header is clicked", async () => {
      await setup();
      await focusBar();

      await click(screen.getByText("Orders"));

      expect(screen.queryByText("ID")).not.toBeInTheDocument();
      expect(screen.getByText("Orders")).toBeInTheDocument();
      expect(screen.getByText("Count")).toBeInTheDocument();
    });

    it("offers OR for a typed or and inserts it", async () => {
      await setup({ value: [leaf(mockSegment("Active users"))] });
      await focusBar();
      await typeText("or");
      expect(screen.getByRole("option", { name: "OR" })).toBeInTheDocument();

      await userEvent.keyboard("{Enter}");

      expect(within(getEditor()).getByText("or")).toBeInTheDocument();
    });

    it("commits a segment as a pill", async () => {
      const { onChange } = await setup();
      await focusBar();

      await click(screen.getByText("Active users"));

      expect(getPillTexts()).toEqual(["Active users"]);
      expect(onChange).toHaveBeenLastCalledWith([
        leaf(mockSegment("Active users")),
      ]);
    });

    it("opens the column list again after a pick", async () => {
      await setup();
      await focusBar();

      await click(screen.getByText("Active users"));

      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getByText("Subtotal")).toBeInTheDocument();
    });

    it("commits an operator without values right away", async () => {
      await setup();
      await focusBar();
      await typeText("status");
      await userEvent.keyboard("{Enter}");

      await typeText("is empty");
      await userEvent.keyboard("{Enter}");

      expect(getPillTexts()).toEqual(["Statusis empty"]);
    });

    it("puts a Summaries column into the next stage", async () => {
      const { onChange } = await setup();
      await focusBar();
      await typeText("count");
      await userEvent.keyboard("{Enter}");

      await typeText("is empty");
      await userEvent.keyboard("{Enter}");

      expect(onChange).toHaveBeenLastCalledWith([
        and(),
        leaf(mockFilter("count", "is-empty")),
      ]);
    });

    it.each(["{ArrowUp}", "{ArrowUp}{ArrowDown}{ArrowUp}"])(
      "wraps around the operators with %s",
      async (keys) => {
        await setup();
        await focusBar();
        await typeText("status");
        await userEvent.keyboard("{Enter}");

        await userEvent.keyboard(`${keys}{Enter}`);

        expect(getPillTexts()).toEqual(["Statusis empty"]);
      },
    );
  });

  describe("focus", () => {
    it("focuses the bar with autoFocus", async () => {
      await setup({ autoFocus: true });

      await waitFor(() => expect(getEditor()).toHaveFocus());
    });
  });
});
