import { render, screen } from "@testing-library/react";

import Banner from "./Banner";

describe("Banner", () => {
  it("should render banner with content", () => {
    render(<Banner>Content</Banner>);

    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
