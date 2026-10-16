import { LRLanguage } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { parser } from "metabase/querying/expressions/tokenizer/parser";

import { type BlockClick, formulaPreview } from "./formula-preview";

const language = LRLanguage.define({ parser });

interface SetupOpts {
  doc: string;
}

function setup({ doc }: SetupOpts) {
  const onBlockClick = jest.fn<void, [BlockClick]>();
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [language, formulaPreview(onBlockClick)],
    }),
  });
  const blocks = () =>
    Array.from(parent.querySelectorAll<HTMLElement>("[data-formula-block]"));
  const cleanup = () => {
    view.destroy();
    parent.remove();
  };
  return { view, parent, blocks, onBlockClick, cleanup };
}

function getPart(block: HTMLElement | undefined, text: string) {
  const part = Array.from(
    block?.querySelectorAll<HTMLElement>("[data-block-part]") ?? [],
  ).find((element) => element.textContent === text);
  if (!part) {
    throw new Error(`Missing block part ${text}`);
  }
  return part;
}

describe("formulaPreview", () => {
  it("shows each simple call as a block labelled with its function and columns", () => {
    const { blocks, cleanup } = setup({ doc: "sum([Price]) / Count()" });
    expect(blocks().map((block) => block.getAttribute("aria-label"))).toEqual([
      "Sum Price",
      "Count",
    ]);
    cleanup();
  });

  it("shows a bare metric reference as a chip, but not columns inside calls", () => {
    const { parent, view, cleanup } = setup({
      doc: "[Revenue] / Sum([Price] * 2)",
    });
    const chips = Array.from(
      parent.querySelectorAll<HTMLElement>("[data-formula-reference]"),
    );
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Revenue",
    ]);
    expect(view.contentDOM).toHaveTextContent("Sum([Price] * 2)");
    cleanup();
  });

  it("shows each calculation in a comma-separated list as a block", () => {
    const { blocks, cleanup } = setup({ doc: "Sum([Price]), Count()" });
    expect(blocks().map((block) => block.getAttribute("aria-label"))).toEqual([
      "Sum Price",
      "Count",
    ]);
    cleanup();
  });

  it("leaves calls with computed arguments as text", () => {
    const { blocks, view, cleanup } = setup({ doc: "Sum([Price] * 2)" });
    expect(blocks()).toHaveLength(0);
    expect(view.contentDOM).toHaveTextContent("Sum([Price] * 2)");
    cleanup();
  });

  it("reports which part of a block was clicked, with its text range", () => {
    const { blocks, onBlockClick, cleanup } = setup({
      doc: "Count() + Max([Created At])",
    });
    const [, max] = blocks();
    getPart(max, "Created At").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    expect(onBlockClick).toHaveBeenCalledTimes(1);
    expect(onBlockClick.mock.calls[0][0]).toMatchObject({
      part: "column",
      columnIndex: 0,
      call: {
        from: 10,
        to: 27,
        name: { from: 10, to: 13, text: "Max" },
        columns: [{ from: 14, to: 26, label: "Created At" }],
      },
    });
    cleanup();
  });
});
