import { render, fireEvent, screen } from "@testing-library/react";

import PasswordReveal from "metabase/components/PasswordReveal";

describe("password reveal", () => {
  it("should toggle the visibility state when hide / show are clicked", () => {
    render(<PasswordReveal />);
    expect(screen.queryByText("Hide")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Show"));

    expect(screen.getByText("Hide")).toBeInTheDocument();
    expect(screen.queryByText("Show")).not.toBeInTheDocument();
  });

  it("should render a copy button", () => {
    render(<PasswordReveal />);
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
  });
});
