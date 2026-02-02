import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithTheme } from "__support__/ui";

import { UserTypeToggle } from "./UserTypeToggle";

describe("UserTypeToggle", () => {
  it("should show correct tooltip for manager", async () => {
    const onChange = jest.fn();
    renderWithTheme(<UserTypeToggle isManager={true} onChange={onChange} />);

    await userEvent.hover(screen.getByTestId("user-type-toggle"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Turn into Member",
    );
  });

  it("should show correct tooltip for member", async () => {
    const onChange = jest.fn();
    renderWithTheme(<UserTypeToggle isManager={false} onChange={onChange} />);

    await userEvent.hover(screen.getByTestId("user-type-toggle"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Turn into Manager",
    );
  });
});
