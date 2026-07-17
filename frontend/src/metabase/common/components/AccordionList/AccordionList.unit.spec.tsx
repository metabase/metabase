import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { fireEvent, render, screen } from "__support__/ui";
import { HoverCard } from "metabase/ui";

import { AccordionList } from "./AccordionList";

type Item = {
  name: string;
};

const SECTIONS = [
  {
    name: "Widgets",
    items: [{ name: "Foo" }, { name: "Bar" }],
  },
  {
    name: "Doohickeys",
    items: [{ name: "Baz" }],
  },
];

describe("AccordionList", () => {
  it("should open the first section by default", () => {
    render(<AccordionList sections={SECTIONS} />);

    assertPresence(["Foo", "Bar"]);
    assertAbsence(["Baz"]);
  });

  it("should open the second section if initiallyOpenSection=1", () => {
    render(<AccordionList sections={SECTIONS} initiallyOpenSection={1} />);
    assertPresence(["Baz"]);
  });

  it("should not open a section if initiallyOpenSection=null", () => {
    render(<AccordionList sections={SECTIONS} initiallyOpenSection={null} />);
    assertAbsence(["Foo", "Bar", "Baz"]);
  });

  it("should open all sections if alwaysExpanded is set", () => {
    render(<AccordionList sections={SECTIONS} alwaysExpanded />);
    assertPresence(["Foo", "Bar", "Baz"]);
  });

  it("should not show search field by default", () => {
    const SEARCH_ICON = screen.queryByRole("img", { name: /search/i });

    render(<AccordionList sections={SECTIONS} />);
    expect(SEARCH_ICON).not.toBeInTheDocument();
  });

  it("should show search field is searchable is set", () => {
    render(<AccordionList sections={SECTIONS} searchable />);
    expect(screen.getByRole("img", { name: /search/i })).toBeInTheDocument();
  });

  it("should close the section when header is clicked", () => {
    render(<AccordionList sections={SECTIONS} />);
    const FIRST_TITLE = screen.getByText("Widgets");

    assertPresence(["Foo", "Bar"]);

    fireEvent.click(FIRST_TITLE);
    assertAbsence(["Foo", "Bar"]);
  });

  it("should switch sections when another section is clicked", () => {
    render(<AccordionList sections={SECTIONS} />);
    const SECOND_TITLE = screen.getByText("Doohickeys");

    assertAbsence(["Baz"]);

    fireEvent.click(SECOND_TITLE);
    assertPresence(["Baz"]);
  });

  it("should filter items when searched", () => {
    render(<AccordionList sections={SECTIONS} searchable />);
    const SEARCH_FIELD = screen.getByPlaceholderText("Find...");

    fireEvent.change(SEARCH_FIELD, { target: { value: "Foo" } });
    assertPresence(["Foo"]);
    assertAbsence(["Bar", "Baz"]);

    fireEvent.change(SEARCH_FIELD, { target: { value: "Something Else" } });
    assertAbsence(["Foo", "Bar", "Baz"]);
  });

  it("should correctly select items when searching", () => {
    render(
      <AccordionList<Item>
        sections={SECTIONS}
        globalSearch
        searchable
        searchProp={["name"]}
      />,
    );
    const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
    const CONTAINER = screen.getAllByRole("tree")[0];

    fireEvent.change(SEARCH_FIELD, { target: { value: "Ba" } });
    assertPresence(["Bar", "Baz"]);
    assertAbsence(["Foo"]);

    fireEvent.keyDown(CONTAINER, { key: "ArrowDown" });
    expect(screen.getByLabelText("Bar").dataset.hascursor).toBe("true");

    fireEvent.keyDown(CONTAINER, { key: "ArrowDown" });
    expect(screen.getByLabelText("Baz").dataset.hascursor).toBe("true");

    fireEvent.keyDown(CONTAINER, { key: "ArrowUp" });
    expect(screen.getByLabelText("Bar").dataset.hascursor).toBe("true");
  });

  it("should render with the search bar on top if globalSearch is set", () => {
    render(<AccordionList sections={SECTIONS} globalSearch searchable />);
    const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
    const sections = ["Widgets", "Doohickeys"];

    sections.forEach((name) => {
      const SECTION = screen.getByText(name);
      expect(SEARCH_FIELD.compareDocumentPosition(SECTION)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });

  it("should render results in all sections when globalSearch is true", () => {
    render(<AccordionList sections={SECTIONS} globalSearch searchable />);
    const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
    fireEvent.change(SEARCH_FIELD, { target: { value: "Ba" } });

    assertPresence(["Bar", "Baz", "Widgets", "Doohickeys"]);
    assertAbsence(["Foo"]);
  });

  it("should render section headers with an action", () => {
    render(
      <AccordionList
        sections={[...SECTIONS, { type: "action", name: "Action" }]}
        searchable
      />,
    );

    expect(screen.getByRole("button", { name: /Action/ })).toBeInTheDocument();
  });

  it("should an empty section when no results are found with globalSearch", () => {
    render(<AccordionList sections={SECTIONS} searchable globalSearch />);

    const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
    fireEvent.change(SEARCH_FIELD, { target: { value: "Quu" } });

    expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
  });

  describe("when a search matches nothing without globalSearch (GDGT-2845)", () => {
    const TYPELESS_SECTION = [{ items: [{ name: "Foo" }, { name: "Bar" }] }];

    it("keeps the search box and shows an empty state for a type-less section", () => {
      render(<AccordionList sections={TYPELESS_SECTION} searchable />);

      const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
      fireEvent.change(SEARCH_FIELD, { target: { value: "Quu" } });

      expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
      expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
      assertAbsence(["Foo", "Bar"]);
    });

    it("keeps the search box and shows an empty state for a typed section", () => {
      const sections = [
        { name: "Back", type: "back" as const, items: [{ name: "Foo" }] },
      ];
      render(<AccordionList sections={sections} searchable />);

      const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
      fireEvent.change(SEARCH_FIELD, { target: { value: "Quu" } });

      expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
      expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
      assertAbsence(["Foo"]);
    });

    it("keeps the search box and shows an empty state for an alwaysExpanded list", () => {
      render(
        <AccordionList sections={TYPELESS_SECTION} searchable alwaysExpanded />,
      );

      const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
      fireEvent.change(SEARCH_FIELD, { target: { value: "Quu" } });

      expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
      expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
      assertAbsence(["Foo", "Bar"]);
    });

    it("shows matches again once the query is cleared", () => {
      render(<AccordionList sections={TYPELESS_SECTION} searchable />);

      const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
      fireEvent.change(SEARCH_FIELD, { target: { value: "Quu" } });
      assertAbsence(["Foo", "Bar"]);

      fireEvent.change(SEARCH_FIELD, { target: { value: "" } });
      assertPresence(["Foo", "Bar"]);
      expect(
        screen.queryByText("Didn't find any results"),
      ).not.toBeInTheDocument();
    });

    it("does not show an empty state when the list is not searchable", () => {
      render(<AccordionList sections={TYPELESS_SECTION} searchable={false} />);

      expect(screen.queryByPlaceholderText("Find...")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Didn't find any results"),
      ).not.toBeInTheDocument();
    });
  });

  describe("with the `renderItemWrapper` prop", () => {
    it("should be able to wrap the list items in components like popovers", async () => {
      const renderItemWrapper = (itemContent: ReactNode) => {
        return (
          <HoverCard>
            <HoverCard.Target>
              <div>{itemContent}</div>
            </HoverCard.Target>
            <HoverCard.Dropdown>popover</HoverCard.Dropdown>
          </HoverCard>
        );
      };

      render(
        <AccordionList
          sections={SECTIONS}
          renderItemWrapper={renderItemWrapper}
        />,
      );

      await userEvent.hover(screen.getByText("Foo"));
      expect(await screen.findByText("popover")).toBeVisible();
    });
  });
});

function assertAbsence(array: string[]) {
  array.forEach((item) => {
    expect(screen.queryByText(item)).not.toBeInTheDocument();
  });
}

function assertPresence(array: string[]) {
  array.forEach((item) => {
    expect(screen.getByText(item)).toBeInTheDocument();
  });
}
