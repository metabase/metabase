import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { UserProfileFormProps } from "./UserProfileForm";
import UserProfileForm from "./UserProfileForm";

const setup = (props: UserProfileFormProps) => {
  const state = createMockState();

  renderWithProviders(<UserProfileForm {...props} />, {
    storeInitialState: state,
  });
};

describe("UserProfileForm", () => {
  it("should show a success message after form submit", async () => {
    const props = getProps({
      onSubmit: jest.fn().mockResolvedValue({}),
    });

    setup(props);

    await userEvent.clear(screen.getByLabelText("First name"));
    await userEvent.type(screen.getByLabelText("First name"), "New name");
    await userEvent.click(screen.getByText("Update"));

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
