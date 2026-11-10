import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { SummaryFieldList } from "./SummaryFieldList";
import type { SummaryField } from "./types";
import { getFieldSections } from "./utils";

type SetupOpts = {
  query?: Lib.Query;
};

function setup({
  query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
}: SetupOpts = {}) {
  const onSelect = jest.fn<void, [SummaryField]>();
  const onAdd = jest.fn<void, [SummaryField]>();
  renderWithProviders(
    <SummaryFieldList
      query={query}
      stageIndex={-1}
      sections={getFieldSections(query, -1)}
      onSelect={onSelect}
      onAdd={onAdd}
    />,
  );
  return { onSelect, onAdd };
}

function getSection(name: string) {
  return screen.getByRole("region", { name });
}

function getSectionToggle(name: string) {
  return within(getSection(name)).getByRole("button", { name });
}

function getItemNames(section: HTMLElement) {
  return within(section)
    .queryAllByTestId("summary-field-item")
    .map((item) => item.textContent);
}

describe("SummaryFieldList", () => {
  it("lists the fields of every table the query reaches, in sections", () => {
    setup();

    expect(
      screen
        .getAllByTestId("summary-field-section")
        .map((section) => section.getAttribute("aria-label")),
    ).toEqual(["Orders", "Product", "User"]);
    expect(getItemNames(getSection("Orders"))).toContain("Total");
    expect(getItemNames(getSection("Product"))).toContain("Category");
  });

  it("selects a field on click and adds it on alt-click", async () => {
    const { onSelect, onAdd } = setup();
    const total = within(getSection("Orders")).getByRole("button", {
      name: "Total",
    });

    await userEvent.click(total);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].kind).toBe("column");
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(total, { altKey: true });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].kind).toBe("column");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("selects a focused field on Enter and adds it on Alt+Enter", async () => {
    const { onSelect, onAdd } = setup();
    within(getSection("Orders")).getByRole("button", { name: "Total" }).focus();

    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Alt>}{Enter}{/Alt}");
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows a column's info when its info icon is hovered", async () => {
    setup();
    const id = within(getSection("Orders")).getByRole("button", { name: "ID" });
    const infoIcon = within(id).getByLabelText("More info");
    expect(screen.queryByText("Entity Key")).not.toBeInTheDocument();

    fireEvent.mouseEnter(infoIcon);

    expect(
      await screen.findByText("Entity Key", {}, { timeout: 1200 }),
    ).toBeInTheDocument();
  });

  it("collapses and expands a section from its name", async () => {
    setup();

    expect(getSectionToggle("Orders")).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(getSectionToggle("Orders"));
    expect(getSectionToggle("Orders")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(getItemNames(getSection("Orders"))).toEqual([]);
    expect(getItemNames(getSection("Product"))).not.toEqual([]);

    await userEvent.click(getSectionToggle("Orders"));
    expect(getSectionToggle("Orders")).toHaveAttribute("aria-expanded", "true");
    expect(getItemNames(getSection("Orders"))).toContain("Total");
  });

  it("shows only the matching fields while searching, in bold where they match", async () => {
    setup();

    await userEvent.type(screen.getByLabelText("Search fields"), "tota");

    expect(
      screen
        .getAllByTestId("summary-field-section")
        .map((section) => section.getAttribute("aria-label")),
    ).toEqual(["Orders"]);
    expect(getItemNames(getSection("Orders"))).toEqual(["Subtotal", "Total"]);

    const [subtotal] = within(getSection("Orders")).getAllByTestId(
      "summary-field-item",
    );
    expect(within(subtotal).getByText("tota").tagName).toBe("STRONG");
  });

  it("opens every section while searching and lets them collapse again afterwards", async () => {
    setup();

    await userEvent.click(getSectionToggle("Product"));
    expect(getItemNames(getSection("Product"))).toEqual([]);

    await userEvent.type(screen.getByLabelText("Search fields"), "cat");
    expect(getSectionToggle("Product")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(getSectionToggle("Product")).toBeDisabled();
    expect(getItemNames(getSection("Product"))).toEqual(["Category"]);

    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText("Search fields")).toHaveValue("");
    expect(getSectionToggle("Product")).toBeEnabled();
    expect(getItemNames(getSection("Product"))).toEqual([]);
  });

  it("clears the search from its clear button", async () => {
    setup();

    await userEvent.type(screen.getByLabelText("Search fields"), "cat");
    await userEvent.click(screen.getByLabelText("Clear search"));

    expect(screen.getByLabelText("Search fields")).toHaveValue("");
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
    expect(getItemNames(getSection("Orders"))).toContain("Total");
  });

  it("says when nothing matches", async () => {
    setup();

    await userEvent.type(screen.getByLabelText("Search fields"), " no such ");

    expect(screen.getByText("Nothing matches “no such”.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("summary-field-section"),
    ).not.toBeInTheDocument();
  });
});
