import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorDetails from "./ErrorDetails";

const setup = (propOverrides?: object) => {
  render(<ErrorDetails details={{ message: "uhoh" }} {...propOverrides} />);
};

describe("ErrorDetails", () => {
  it("should render string errors", async () => {
    setup({ details: "Oh no!" });
    await userEvent.click(screen.getByText("Show error details"));

    expect(await screen.findByText("Oh no!")).toBeVisible();
  });

  it("should render message property errors", async () => {
    setup({ details: { message: "Oh no!" } });
    await userEvent.click(screen.getByText("Show error details"));

    expect(await screen.findByText("Oh no!")).toBeVisible();
  });

  it("should toggle details", async () => {
    setup({ details: { message: "Oh no!" } });
    expect(screen.queryByText("Oh no!")).not.toBeVisible();

    await userEvent.click(screen.getByText("Show error details"));

    expect(await screen.findByText("Oh no!")).toBeVisible();
  });
});
