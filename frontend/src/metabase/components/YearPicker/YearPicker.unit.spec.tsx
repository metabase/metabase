import { render, screen } from "@testing-library/react";

import YearPicker from "./YearPicker";

describe("YearPicker", () => {
  it("should render correctly", () => {
    render(<YearPicker value={2022} onChange={jest.fn()}></YearPicker>);
    expect(screen.getByRole("button")).toHaveTextContent("2022");
  });
});
