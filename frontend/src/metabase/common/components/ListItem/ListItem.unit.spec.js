import { Route } from "react-router";

import { getIcon, renderWithProviders, screen } from "__support__/ui";

import ListItem from "./ListItem";

const ITEM_NAME = "Table Foo";
const ITEM_DESCRIPTION = "Nice table description.";
const PLACEHOLDER_TEXT = "Placeholder text";

function setup({ name, ...opts }) {
  return renderWithProviders(
    <Route path="/" component={() => <ListItem name={name} {...opts} />} />,
    { withRouter: true },
  );
}

describe("ListItem", () => {
  it("should render", () => {
    setup({
      name: ITEM_NAME,
      description: ITEM_DESCRIPTION,
      icon: "table",
      url: "/foo",
    });

    expect(screen.getByText(ITEM_NAME)).toBeInTheDocument();
    expect(screen.getByText(ITEM_DESCRIPTION)).toBeInTheDocument();
    expect(getIcon("table")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveProperty(
      "href",
      "http://localhost/foo",
    );
  });

  it("should render with just the name", () => {
    setup({ name: ITEM_NAME });
    expect(screen.getByText(ITEM_NAME)).toBeInTheDocument();
  });

  it("should display the placeholder if there's no description", () => {
    setup({ name: ITEM_NAME, placeholder: PLACEHOLDER_TEXT });

    expect(screen.getByText(ITEM_NAME)).toBeInTheDocument();
    expect(screen.getByText(PLACEHOLDER_TEXT)).toBeInTheDocument();
  });

  it("should display the description and omit the placeholder if both are present", () => {
    setup({
      name: ITEM_NAME,
      description: ITEM_DESCRIPTION,
      placeholder: PLACEHOLDER_TEXT,
    });

    expect(screen.getByText(ITEM_NAME)).toBeInTheDocument();
    expect(screen.getByText(ITEM_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(PLACEHOLDER_TEXT)).not.toBeInTheDocument();
  });

  it("should not render the link when disabled", () => {
    setup({
      name: ITEM_NAME,
      disabled: true,
      url: "/foo",
    });

    expect(screen.getByText(ITEM_NAME)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
