import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSetupState,
  createMockState,
  createMockUserInfo,
} from "metabase-types/store/mocks";

import { SUBSCRIBE_URL } from "../../constants";

import { NewsletterForm } from "./NewsletterForm";

const USER_EMAIL = "user@metabase.test";

const setup = () => {
  const state = createMockState({
    setup: createMockSetupState({
      user: createMockUserInfo({
        email: USER_EMAIL,
      }),
    }),
  });

  fetchMock.post(SUBSCRIBE_URL, {});
  renderWithProviders(<NewsletterForm />, { storeInitialState: state });
};

describe("NewsletterForm", () => {
  it("should allow to submit the form with the provided email", async () => {
    setup();
    expect(screen.getByDisplayValue(USER_EMAIL)).toBeInTheDocument();

    await userEvent.click(screen.getByText("Subscribe"));
    expect(await screen.findByText(/You're subscribed/)).toBeInTheDocument();
    expect(fetchMock.done(SUBSCRIBE_URL)).toBe(true);
  });
});
