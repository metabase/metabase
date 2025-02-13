import { render, screen } from "@testing-library/react";

import FileInput from "./FileInput";

describe("FileInput", () => {
  it("should render correctly", () => {
    render(<FileInput aria-label="SSL certificate" />);

    expect(screen.getByLabelText("SSL certificate")).toBeInTheDocument();
  });
});
