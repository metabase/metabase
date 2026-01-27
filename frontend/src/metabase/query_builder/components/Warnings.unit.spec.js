import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Warnings } from "metabase/query_builder/components/Warnings";

describe("Warnings", () => {
  it("should render a warning icon", () => {
    render(<Warnings warnings={["foo"]} />);
    expect(screen.getByLabelText("warning icon")).toBeInTheDocument();
  });

  it("should render a warning message tooltip on hover", async () => {
    render(<Warnings warnings={["test warning message"]} />);
    await userEvent.hover(screen.getByLabelText("warning icon"));
    expect(await screen.findByText("test warning message")).toBeInTheDocument();
  });

  it("should render multiple warnings", async () => {
    const warningMessages = ["foo", "bar", "baz"];
    render(<Warnings warnings={warningMessages} />);
    await userEvent.hover(screen.getByLabelText("warning icon"));

    for (const message of warningMessages) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
  });
});
