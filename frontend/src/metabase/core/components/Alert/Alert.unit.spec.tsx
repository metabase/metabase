import { render, screen } from "@testing-library/react";

import Alert from "./Alert";

const ALERT_TEXT = "alert text";

describe("Alert", () => {
  it("renders content", () => {
    render(<Alert>{ALERT_TEXT}</Alert>);
    expect(screen.getByText(ALERT_TEXT)).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(<Alert icon="info">{ALERT_TEXT}</Alert>);
    expect(screen.getByLabelText("info icon")).toBeInTheDocument();
  });
});
