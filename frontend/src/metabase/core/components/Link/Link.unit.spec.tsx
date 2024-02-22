import { render, screen } from "@testing-library/react";

import Link from "./Link";

describe("Link", () => {
  it("should render correctly", () => {
    render(<Link to="/">Home</Link>);

    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});
