import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen } from "__support__/ui";
import { createMockUser, createMockVersion } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { SwagButton } from "./SwagButton";
import { SWAG_LINK } from "./constants";

const USER_EMAIL = "toucan@metabase.com";
const DEFAULT_DATE = new Date("2024-09-27");

const user = userEvent.setup({ delay: null });

const setup = ({ versionTag = "v0.51.0-RC" } = {}) => {
  renderWithProviders(<SwagButton />, {
    storeInitialState: {
      currentUser: createMockUser({
        email: USER_EMAIL,
      }),
      settings: createMockSettingsState({
        version: createMockVersion({
          tag: versionTag,
        }),
      }),
    },
  });
};

it("should render a button when date is below threshold and version includes RC", () => {
  jest.useFakeTimers({
    now: DEFAULT_DATE,
  });
  setup();
  expect(screen.getByText(/Claim your swag/i)).toBeInTheDocument();
});

it("should not render a button when date is above threshold", () => {
  jest.useFakeTimers({
    now: new Date("2024-11-27"),
  });
  setup();
  expect(screen.queryByText(/Claim your swag/i)).not.toBeInTheDocument();
});

it("should not render a button when version is not an RC", () => {
  jest.useFakeTimers({
    now: DEFAULT_DATE,
  });
  setup({ versionTag: "v0.51.3" });
  expect(screen.queryByText(/Claim your swag/i)).not.toBeInTheDocument();
});

it("Clicking the swag button should open a modal", async () => {
  jest.useFakeTimers({
    now: DEFAULT_DATE,
  });
  setup();

  await act(async () => {
    await user.click(screen.getByText(/Claim your swag/i));
  });

  expect(
    screen.getByRole("heading", { name: "A little something from us to you" }),
  ).toBeInTheDocument();

  expect(screen.getByRole("link", { name: "Get my swag" })).toHaveAttribute(
    "href",
    `${SWAG_LINK}?email=${USER_EMAIL}`,
  );
});

it("Clicking the swag link should change the class on the button", async () => {
  jest.useFakeTimers({
    now: DEFAULT_DATE,
  });
  setup();

  await act(async () => {
    await user.click(screen.getByText(/Claim your swag/i));
  });

  await act(async () => {
    await user.click(screen.getByRole("link", { name: "Get my swag" }));
  });

  expect(screen.getByTestId("swag-button")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
