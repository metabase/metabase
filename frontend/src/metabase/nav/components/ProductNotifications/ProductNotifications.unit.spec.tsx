import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { ProductNotification } from "metabase-types/api";

import { ProductNotifications } from "./ProductNotifications";

const NOTIFICATION_A: ProductNotification = {
  id: "a",
  title: "First notification",
  content: "Hello from A. [Register](https://example.com/a).",
  icon: "join_full_outer",
};

const NOTIFICATION_B: ProductNotification = {
  id: "b",
  title: "Second notification",
  content: "Hello from B.",
};

const setup = ({
  notifications = [],
  dismissedIds = [],
}: {
  notifications?: ProductNotification[];
  dismissedIds?: string[];
} = {}) => {
  fetchMock.put("path:/api/setting/dismissed-notification-ids", 200);

  return renderWithProviders(<ProductNotifications />, {
    storeInitialState: {
      settings: createMockSettingsState({
        notifications,
        "dismissed-notification-ids": dismissedIds,
      }),
    },
  });
};

describe("ProductNotifications", () => {
  it("renders nothing when there are no notifications", () => {
    setup({ notifications: [] });
    expect(screen.queryByText("First notification")).not.toBeInTheDocument();
  });

  it("shows one notification at a time and renders markdown links that open in a new tab", () => {
    setup({ notifications: [NOTIFICATION_A, NOTIFICATION_B] });

    expect(screen.getByText("First notification")).toBeInTheDocument();
    expect(screen.queryByText("Second notification")).not.toBeInTheDocument();

    // the notification's icon is rendered
    expect(screen.getByLabelText("join_full_outer icon")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Register" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("skips notifications the user has already dismissed", () => {
    setup({
      notifications: [NOTIFICATION_A, NOTIFICATION_B],
      dismissedIds: ["a"],
    });

    expect(screen.queryByText("First notification")).not.toBeInTheDocument();
    expect(screen.getByText("Second notification")).toBeInTheDocument();
  });

  it("dismisses the current notification, records the id, and reveals the next", async () => {
    setup({ notifications: [NOTIFICATION_A, NOTIFICATION_B] });

    expect(screen.getByText("First notification")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("Second notification")).toBeInTheDocument();
    expect(screen.queryByText("First notification")).not.toBeInTheDocument();

    const calls = fetchMock.callHistory.calls(
      "path:/api/setting/dismissed-notification-ids",
    );
    expect(calls).toHaveLength(1);
    // fetch-mock types the recorded body loosely; the update mutation always
    // sends a JSON string body.
    expect(JSON.parse(calls[0].options.body as string)).toEqual({
      value: ["a"],
    });
  });
});
