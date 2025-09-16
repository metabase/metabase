import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { GlossaryItem } from "metabase/api";

import { GlossaryTable } from "./GlossaryTable";

function makeItem(overrides: Partial<GlossaryItem> = {}): GlossaryItem {
  return {
    id: overrides.id ?? 1,
    term: overrides.term ?? "Alpha",
    definition: overrides.definition ?? "First",
  } as GlossaryItem;
}

describe("GlossaryTable", () => {
  it("shows empty state", () => {
    renderWithProviders(
      <GlossaryTable
        className="test"
        glossary={[]}
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByText(/No terms found\./i)).toBeInTheDocument();
  });

  it("creates a new record", async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();

    renderWithProviders(
      <GlossaryTable
        glossary={[makeItem({ id: 1 })]}
        onCreate={onCreate}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new term/i }));

    const termInput = screen.getByPlaceholderText(/bird/i);
    const defInput = screen.getByPlaceholderText(/a thing with wings\./i);
    await user.clear(termInput);
    await user.type(termInput, "  Bird  ");
    await user.type(defInput, "  Flies sometimes  ");

    const table0 = screen.getByRole("table");
    const rows0 = within(table0).getAllByRole("row");
    const createRow0 = rows0.find((r) =>
      within(r).queryByPlaceholderText(/bird/i),
    );
    expect(createRow0).toBeTruthy();
    const addInCreate = within(createRow0 as HTMLElement).getByRole("button", {
      name: /add/i,
    });

    expect(addInCreate).toBeEnabled();
    await user.click(addInCreate);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("Bird", "Flies sometimes");
  });

  it("edits a record", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: 42, term: "Cat", definition: "Meows" });
    const onEdit = jest.fn();

    renderWithProviders(
      <GlossaryTable
        glossary={[item]}
        onCreate={jest.fn()}
        onEdit={onEdit}
        onDelete={jest.fn()}
      />,
    );

    await user.click(screen.getByText("Cat"));

    const termInput = screen.getByPlaceholderText(/bird/i);
    const defInput = screen.getByPlaceholderText(/a thing with wings\./i);

    await user.clear(termInput);
    await user.type(termInput, "Kitten");
    await user.clear(defInput);
    await user.type(defInput, "Young cat");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(42, "Kitten", "Young cat");
  });

  it("focuses proper field when starting edit from term vs definition", async () => {
    const user = userEvent.setup();
    const item = makeItem({ term: "Dog", definition: "Barks" });

    const { rerender } = renderWithProviders(
      <GlossaryTable
        glossary={[item]}
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    // Click term -> term input should be focused
    await user.click(screen.getByText("Dog"));
    const termInput = screen.getByPlaceholderText(/bird/i);
    expect(termInput).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // Re-render to reset DOM state and click definition cell
    rerender(
      <GlossaryTable
        glossary={[item]}
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await user.click(screen.getByText("Barks"));
    const defInput = screen.getByPlaceholderText(/a thing with wings\./i);
    expect(defInput).toHaveFocus();
  });

  it("sorts by term header", async () => {
    const user = userEvent.setup();
    const rows: GlossaryItem[] = [
      makeItem({ id: 1, term: "Beta", definition: "Second" }),
      makeItem({ id: 2, term: "Alpha", definition: "First" }),
      makeItem({ id: 3, term: "Gamma", definition: "Third" }),
    ];

    renderWithProviders(
      <GlossaryTable
        glossary={rows}
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const termHeader = screen.getByRole("columnheader", { name: /^term$/i });
    const getTermsOrder = (): string[] => {
      const table = screen.getByRole("table");
      const rowEls = within(table).getAllByRole("row");
      const dataRows = rowEls.slice(1); // skip header row
      return dataRows.map((r) => {
        const firstCell = within(r).getAllByRole("cell")[0];
        return firstCell.textContent?.trim() || "";
      });
    };

    const orders: string[][] = [];
    await user.click(within(termHeader).getByText(/^term$/i));
    orders.push(getTermsOrder());
    await user.click(within(termHeader).getByText(/^term$/i));
    orders.push(getTermsOrder());
    await user.click(within(termHeader).getByText(/^term$/i));
    orders.push(getTermsOrder());

    const ASC = ["Alpha", "Beta", "Gamma"].join("|");
    const DESC = ["Gamma", "Beta", "Alpha"].join("|");
    const serialized = orders.map((o) => o.join("|"));

    expect(serialized).toEqual(expect.arrayContaining([ASC, DESC, ASC]));
  });

  it("deletes a record with confirmation", async () => {
    const user = userEvent.setup();
    const item = makeItem({
      id: 7,
      term: "DeleteMe",
      definition: "To be removed",
    });
    const onDelete = jest.fn();

    renderWithProviders(
      <GlossaryTable
        glossary={[item]}
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onDelete={onDelete}
      />,
    );

    // Hover row to reveal delete icon: find the row that contains DeleteMe
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const row = rows.find((r) => within(r).queryByText("DeleteMe"));
    expect(row).toBeTruthy();
    await user.hover(row as HTMLElement);

    await user.click(screen.getByRole("button", { name: /delete/i }));

    // Confirm modal: scope search within the modal dialog
    const modal = await screen.findByRole("dialog");
    await user.click(within(modal).getByRole("button", { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(7);
  });

  it("disables Add until both fields are filled in create/edit mode", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <GlossaryTable
        glossary={[]}
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new term/i }));

    // Add button (check icon) should be disabled until both fields filled
    const table2 = screen.getByRole("table");
    const rows2 = within(table2).getAllByRole("row");
    const createRow = rows2.find((r) =>
      within(r).queryByPlaceholderText(/bird/i),
    );
    expect(createRow).toBeTruthy();
    const addBtn = within(createRow as HTMLElement).getByRole("button", {
      name: /add/i,
    });
    expect(addBtn).toBeDisabled();

    // Fill only one field and still disabled
    await user.type(screen.getByPlaceholderText(/bird/i), "Sparrow");
    expect(addBtn).toBeDisabled();

    // Fill both fields and enabled
    await user.type(
      screen.getByPlaceholderText(/a thing with wings\./i),
      "Flies sometimes",
    );
    expect(addBtn).toBeEnabled();
  });
});
