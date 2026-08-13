import { mockSettings } from "__support__/settings";
import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { LockedTransformsHoverCard } from "./LockedTransformsHoverCard";

function setup({
  isAdmin = false,
  isStoreUser = false,
}: {
  isAdmin?: boolean;
  isStoreUser?: boolean;
} = {}) {
  jest.useFakeTimers();

  const currentUser = createMockUser({
    email: "user@example.com",
    is_superuser: isAdmin,
  });

  renderWithProviders(
    <LockedTransformsHoverCard>
      <button>Run transform</button>
    </LockedTransformsHoverCard>,
    {
      storeInitialState: createMockState({
        currentUser,
        settings: mockSettings({
          "token-status": {
            status: "valid",
            valid: true,
            "store-users": [
              { email: isStoreUser ? currentUser.email : "store@example.com" },
            ],
            features: [],
          },
        }),
      }),
    },
  );

  fireEvent.mouseEnter(screen.getByRole("button", { name: "Run transform" }));
  act(() => jest.runAllTimers());
}

describe("LockedTransformsHoverCard", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("shows the paid subscription link when the user is an admin", () => {
    setup({ isAdmin: true, isStoreUser: false });

    expect(
      screen.getByRole("link", { name: "Start paid subscription" }),
    ).toBeInTheDocument();
  });

  it("shows the paid subscription link when the user is a store user", () => {
    setup({ isAdmin: false, isStoreUser: true });

    expect(
      screen.getByRole("link", { name: "Start paid subscription" }),
    ).toBeInTheDocument();
  });

  it("shows the Store Admin message when the user is not an admin or store user", () => {
    setup({ isAdmin: false, isStoreUser: false });

    expect(
      screen.getByText(
        "Please ask a Store Admin (store@example.com) to enable this for you.",
      ),
    ).toBeInTheDocument();
  });
});
