import { render, screen } from "__support__/ui";

import { Link } from "./Link";

describe("Link", () => {
  it("should render correctly", () => {
    render(<Link to="/">Home</Link>);

    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});
