import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockUser } from "metabase-types/api/mocks";
import UserProfileForm, { UserProfileFormProps } from "./UserProfileForm";

describe("UserProfileForm", () => {
  it("should show a success message after form submit", async () => {
    const props = getProps({
      onSubmit: jest.fn().mockResolvedValue({}),
    });

    render(<UserProfileForm {...props} />);
    userEvent.clear(screen.getByLabelText("First name"));
    userEvent.type(screen.getByLabelText("First name"), "New name");
    userEvent.click(screen.getByText("Update"));

    expect(await screen.findByText("Success")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<UserProfileFormProps>,
): UserProfileFormProps => ({
  user: createMockUser(),
  locales: null,
  isSsoUser: false,
  onSubmit: jest.fn(),
  ...opts,
});
