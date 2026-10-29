import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { GlossaryItem } from "metabase/api";

import { GlossaryTable, type GlossaryTableProps } from "./GlossaryTable";

function makeItem(overrides: Partial<GlossaryItem> = {}): GlossaryItem {
  return {
    id: overrides.id ?? 1,
    term: overrides.term ?? "Alpha",
    definition: overrides.definition ?? "First",
  };
}

function setup(props: Partial<GlossaryTableProps> = {}) {
  const onCreate = jest.fn();
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  renderWithProviders(
    <>
      <GlossaryTable
        glossary={[]}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
        {...props}
      />
      <button>Outside</button>
    </>,
  );
  return { onCreate, onEdit, onDelete };
}

function getDataRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function getFields(row: HTMLElement) {
  const [term, definition] = within(row).getAllByRole("textbox");
  return { term, definition };
}

function getValue(field: HTMLElement) {
  return field instanceof HTMLTextAreaElement ? field.value : null;
}

function getFieldsByTerm(term: string) {
  const row = getDataRows().find(
    (row) => getValue(getFields(row).term) === term,
  );
  if (!row) {
    throw new Error(`No row for term ${term}`);
  }
  return getFields(row);
}

function getTermValues() {
  return getDataRows().map((row) => getValue(getFields(row).term));
}

const getNewTermField = () => screen.getByPlaceholderText("Boat");
const getNewDefinitionField = () =>
  screen.getByPlaceholderText(/a small vessel/i);
const queryDuplicateWarning = () =>
  screen.queryByText("This term already exists in the Glossary");

describe("GlossaryTable", () => {
  it("shows empty state", () => {
    setup();

    expect(screen.getByText(/No terms yet/i)).toBeInTheDocument();
  });

  describe("search", () => {
    const glossary = [
      makeItem({ id: 1, term: "ARR", definition: "Annual recurring revenue" }),
      makeItem({ id: 2, term: "Churn", definition: "Customers who cancel" }),
      makeItem({ id: 3, term: "MRR", definition: "Monthly Recurring Revenue" }),
    ];

    it("filters terms by term or definition, case-insensitively", async () => {
      setup({ glossary, readOnly: true });

      await userEvent.type(screen.getByPlaceholderText("Search..."), " churn ");
      expect(getTermValues()).toEqual(["Churn"]);

      await userEvent.clear(screen.getByPlaceholderText("Search..."));
      await userEvent.type(
        screen.getByPlaceholderText("Search..."),
        "recurring",
      );
      expect(getTermValues()).toEqual(["ARR", "MRR"]);
    });

    it("shows a no-results message when nothing matches", async () => {
      setup({ glossary, readOnly: true });

      await userEvent.type(screen.getByPlaceholderText("Search..."), "zebra");

      expect(screen.getByText('No results for "zebra"')).toBeInTheDocument();
      expect(screen.queryByText(/No terms yet/i)).not.toBeInTheDocument();
    });

    it("keeps the new term row visible while searching", async () => {
      setup({ glossary });

      await userEvent.type(screen.getByPlaceholderText("Search..."), "zebra");
      await userEvent.click(screen.getByRole("button", { name: /new term/i }));

      expect(getNewTermField()).toBeInTheDocument();
    });
  });

  describe("creating", () => {
    it("moves to the definition on Enter and saves trimmed values on the second Enter", async () => {
      const { onCreate } = setup({ glossary: [makeItem()] });

      await userEvent.click(screen.getByRole("button", { name: /new term/i }));
      expect(getNewTermField()).toHaveFocus();

      await userEvent.type(getNewTermField(), "  Bird  {Enter}");
      expect(getNewDefinitionField()).toHaveFocus();
      expect(onCreate).not.toHaveBeenCalled();

      await userEvent.type(
        getNewDefinitionField(),
        "  Flies{Shift>}{Enter}{/Shift}sometimes  {Enter}",
      );

      expect(onCreate).toHaveBeenCalledTimes(1);
      expect(onCreate).toHaveBeenCalledWith("Bird", "Flies\nsometimes");
      expect(screen.queryByPlaceholderText("Boat")).not.toBeInTheDocument();
    });

    it("saves when focus leaves a completed row", async () => {
      const { onCreate } = setup();

      await userEvent.click(screen.getByRole("button", { name: /new term/i }));
      await userEvent.type(getNewTermField(), "Bird");
      await userEvent.click(getNewDefinitionField());
      expect(onCreate).not.toHaveBeenCalled();

      await userEvent.type(getNewDefinitionField(), "Flies");
      await userEvent.click(screen.getByRole("button", { name: "Outside" }));

      expect(onCreate).toHaveBeenCalledWith("Bird", "Flies");
    });

    it("keeps an incomplete row open when focus leaves it", async () => {
      const { onCreate } = setup();

      await userEvent.click(screen.getByRole("button", { name: /new term/i }));
      await userEvent.type(getNewTermField(), "Bird");
      await userEvent.click(screen.getByRole("button", { name: "Outside" }));

      expect(onCreate).not.toHaveBeenCalled();
      expect(getNewTermField()).toHaveValue("Bird");
    });

    it("discards an empty row when focus leaves it", async () => {
      setup();

      await userEvent.click(screen.getByRole("button", { name: /new term/i }));
      await userEvent.click(screen.getByRole("button", { name: "Outside" }));

      expect(screen.queryByPlaceholderText("Boat")).not.toBeInTheDocument();
    });

    it("discards the row on Escape without saving", async () => {
      const { onCreate } = setup();

      await userEvent.click(screen.getByRole("button", { name: /new term/i }));
      await userEvent.type(getNewTermField(), "Bird");
      await userEvent.type(getNewDefinitionField(), "Flies{Escape}");

      expect(onCreate).not.toHaveBeenCalled();
      expect(screen.queryByPlaceholderText("Boat")).not.toBeInTheDocument();
    });

    it("blocks saving a term that already exists, case-insensitively", async () => {
      const { onCreate } = setup({ glossary: [makeItem({ term: "Alpha" })] });

      await userEvent.click(screen.getByRole("button", { name: /new term/i }));
      await userEvent.type(getNewTermField(), "ALPHA");
      expect(queryDuplicateWarning()).toBeInTheDocument();

      await userEvent.type(getNewDefinitionField(), "Duplicate{Enter}");
      await userEvent.click(screen.getByRole("button", { name: "Outside" }));

      expect(onCreate).not.toHaveBeenCalled();
      expect(getNewTermField()).toHaveValue("ALPHA");
    });
  });

  describe("editing", () => {
    it("saves a trimmed term on Enter", async () => {
      const item = makeItem({ id: 42, term: "Cat", definition: "Meows" });
      const { onEdit } = setup({ glossary: [item] });
      const { term } = getFieldsByTerm("Cat");

      await userEvent.clear(term);
      await userEvent.type(term, "  Kitten  {Enter}");

      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onEdit).toHaveBeenCalledWith(42, "Kitten", "Meows");
      expect(term).not.toHaveFocus();
    });

    it("saves the definition on Enter, keeping Shift+Enter line breaks", async () => {
      const item = makeItem({ id: 42, term: "Cat", definition: "Meows" });
      const { onEdit } = setup({ glossary: [item] });
      const { definition } = getFieldsByTerm("Cat");

      await userEvent.type(definition, "{Shift>}{Enter}{/Shift}Purrs{Enter}");

      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onEdit).toHaveBeenCalledWith(42, "Cat", "Meows\nPurrs");
    });

    it("saves the definition on blur", async () => {
      const item = makeItem({ id: 42, term: "Cat", definition: "Meows" });
      const { onEdit } = setup({ glossary: [item] });
      const { definition } = getFieldsByTerm("Cat");

      await userEvent.type(definition, " loudly");
      await userEvent.click(screen.getByRole("button", { name: "Outside" }));

      expect(onEdit).toHaveBeenCalledWith(42, "Cat", "Meows loudly");
    });

    it("reverts on Escape without saving", async () => {
      const item = makeItem({ id: 42, term: "Cat", definition: "Meows" });
      const { onEdit } = setup({ glossary: [item] });
      const { definition } = getFieldsByTerm("Cat");

      await userEvent.type(definition, " loudly{Escape}");

      expect(onEdit).not.toHaveBeenCalled();
      expect(definition).toHaveValue("Meows");
    });

    it("reverts a blank definition without saving", async () => {
      const item = makeItem({ id: 42, term: "Cat", definition: "Meows" });
      const { onEdit } = setup({ glossary: [item] });

      await userEvent.clear(getFieldsByTerm("Cat").definition);
      await userEvent.type(getFieldsByTerm("Cat").definition, "   {Enter}");

      expect(onEdit).not.toHaveBeenCalled();
      expect(getFieldsByTerm("Cat").definition).toHaveValue("Meows");
    });

    it("does not warn about the row's own term", async () => {
      setup({ glossary: [makeItem({ term: "Alpha" })] });
      const { term } = getFieldsByTerm("Alpha");

      await userEvent.clear(term);
      await userEvent.type(term, "alpha");

      expect(queryDuplicateWarning()).not.toBeInTheDocument();
    });

    it("warns about and reverts a term that matches another entry", async () => {
      const { onEdit } = setup({
        glossary: [
          makeItem({ id: 1, term: "Alpha", definition: "First" }),
          makeItem({ id: 2, term: "Beta", definition: "Second" }),
        ],
      });
      const { term } = getFieldsByTerm("Alpha");

      await userEvent.clear(term);
      await userEvent.type(term, "beta");
      expect(queryDuplicateWarning()).toBeInTheDocument();

      await userEvent.type(term, "{Enter}");

      expect(onEdit).not.toHaveBeenCalled();
      expect(queryDuplicateWarning()).not.toBeInTheDocument();
      expect(getTermValues()).toEqual(["Alpha", "Beta"]);
    });
  });

  it("sorts by term header", async () => {
    setup({
      glossary: [
        makeItem({ id: 1, term: "Beta", definition: "Second" }),
        makeItem({ id: 2, term: "Alpha", definition: "First" }),
        makeItem({ id: 3, term: "Gamma", definition: "Third" }),
      ],
    });
    const termHeader = screen.getByRole("columnheader", { name: /^term$/i });

    await userEvent.click(termHeader);
    expect(getTermValues()).toEqual(["Alpha", "Beta", "Gamma"]);

    await userEvent.click(termHeader);
    expect(getTermValues()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("deletes a record with confirmation", async () => {
    const { onDelete } = setup({
      glossary: [makeItem({ id: 7, term: "DeleteMe" })],
    });

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: /delete/i }),
    );

    expect(onDelete).toHaveBeenCalledWith(7);
  });

  describe("readOnly", () => {
    it("hides create and delete controls and disables editing", () => {
      setup({ glossary: [makeItem({ term: "Alpha" })], readOnly: true });

      expect(
        screen.queryByRole("button", { name: /new term/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /delete/i }),
      ).not.toBeInTheDocument();

      const { term, definition } = getFieldsByTerm("Alpha");
      expect(term).toBeDisabled();
      expect(definition).toBeDisabled();
    });
  });
});
