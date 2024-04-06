import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Radio from "./Radio";

describe("Radio", () => {
  const options = [
    { name: "Line", value: "L" },
    { name: "Area", value: "A" },
    { name: "Bar", value: "B" },
  ];

  it("should receive focus on tab", async () => {
    render(<Radio options={options} />);
    await userEvent.tab();

    expect(screen.getByLabelText("Line")).toHaveFocus();
  });
});
