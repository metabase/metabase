/* eslint-disable jest/expect-expect */
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import AccordionList from "metabase/core/components/AccordionList";

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
    screen.getByRole("img", { name: /search/i });
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

  it("should render with the search bar on top if globalSearch is set", () => {
    render(<AccordionList sections={SECTIONS} globalSearch searchable />);
    const SEARCH_FIELD = screen.getByPlaceholderText("Find...");
    const sections = ["Widgets", "Doohickeys"];

    sections.forEach(name => {
      const SECTION = screen.queryByText(name);
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

  describe("with the `renderItemWrapper` prop", () => {
    it("should be able to wrap the list items in components like popovers", async () => {
      const renderItemWrapper = (itemContent, item) => {
        return (
          <TippyPopover content={<div>popover</div>}>
            {itemContent}
          </TippyPopover>
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

function assertAbsence(array) {
  array.forEach(item => {
    expect(screen.queryByText(item)).not.toBeInTheDocument();
  });
}

function assertPresence(array) {
  array.forEach(item => {
    expect(screen.getByText(item)).toBeInTheDocument();
  });
}
