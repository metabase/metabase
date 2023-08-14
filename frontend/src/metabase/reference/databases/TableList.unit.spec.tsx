import { screen } from "@testing-library/react";
import { Route } from "react-router";
import { renderWithProviders } from "__support__/ui";

import TableList from "./TableList";

function setup({ ...options } = {}) {
  return renderWithProviders(
    <Route path="/" component={() => <TableList {...options} />} />,
    { withRouter: true },
  );
}

describe("TableList", () => {
  it("should render", () => {
    setup();

    expect(screen.getByText("Tables")).toBeInTheDocument();
  });
});
