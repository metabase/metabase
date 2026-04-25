import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { Location } from "history";
import { Route } from "react-router";

import { setupUsersEndpoints } from "__support__/server-mocks";
import { setupAdminListNotificationsEndpoint } from "__support__/server-mocks/notification";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createMockLocation } from "metabase/redux/store/mocks";
import * as Urls from "metabase/utils/urls";
import type { AdminNotificationListItem } from "metabase-types/api";
import {
  createMockAdminNotificationListItem,
  createMockCard,
  createMockNotificationHandlerEmail,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { NotificationsAdminPage } from "./NotificationsAdminPage";

const PATHNAME = Urls.adminToolsNotifications();

interface SetupOpts {
  notifications?: AdminNotificationListItem[];
  location?: Location;
}

const setup = ({
  notifications = [],
  location = createMockLocation({ pathname: PATHNAME }),
}: SetupOpts = {}) => {
  setupUsersEndpoints([]);
  // CardPicker only fires when user types into it, but catch any request to
  // /api/search defensively so the test stays stable.
  fetchMock.get("path:/api/search", { data: [], total: 0 });
  setupAdminListNotificationsEndpoint(notifications);

  return renderWithProviders(
    <Route path={PATHNAME} component={NotificationsAdminPage} />,
    {
      initialRoute: `${location.pathname}${location.search}`,
      withRouter: true,
    },
  );
};

const alertFor = (
  overrides: Partial<AdminNotificationListItem>,
): AdminNotificationListItem =>
  createMockAdminNotificationListItem({
    payload: {
      id: 1,
      card_id: 42,
      send_once: false,
      send_condition: "has_result",
      created_at: "2025-01-07T18:40:47.245205+03:00",
      updated_at: "2025-01-07T18:40:47.245205+03:00",
      card: createMockCard({ id: 42, name: "Sales report" }),
    },
    creator: createMockUserInfo({ common_name: "Marketing Maggie" }),
    handlers: [createMockNotificationHandlerEmail()],
    ...overrides,
  });

describe("NotificationsAdminPage", () => {
  it("renders a row per notification with card name and creator", async () => {
    setup({
      notifications: [
        alertFor({
          id: 11,
          health: "healthy",
          last_sent_at: "2026-04-21T16:00:00.000Z",
        }),
      ],
    });

    await waitForLoaderToBeRemoved();

    const row = screen.getByTestId("notification-row-11");
    expect(within(row).getByText("Sales report")).toBeInTheDocument();
    expect(within(row).getByText("Marketing Maggie")).toBeInTheDocument();
    expect(within(row).getByText("Healthy")).toBeInTheDocument();
  });

  it("shows the new short health labels", async () => {
    setup({
      notifications: [
        alertFor({ id: 1, health: "orphaned_card" }),
        alertFor({ id: 2, health: "orphaned_creator" }),
        alertFor({ id: 3, health: "failing" }),
      ],
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Orphaned")).toBeInTheDocument();
    expect(screen.getByText("No owner")).toBeInTheDocument();
    expect(screen.getByText("Failing")).toBeInTheDocument();
    // "Deactivated" is no longer used as a health label (it read as
    // "the alert is off", but really means "the creator is deactivated")
    expect(screen.queryByText("Deactivated")).not.toBeInTheDocument();
  });

  it("uses 'Filter by X' placeholders like the Tasks/Runs pages", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByPlaceholderText("Filter by status")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter by health")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Filter by channel"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Filter by recipient email"),
    ).toBeInTheDocument();
  });

  it("navigates to the detail page when the row is clicked", async () => {
    const { history } = setup({
      notifications: [alertFor({ id: 11 })],
    });
    await waitForLoaderToBeRemoved();

    // Click on the Creator cell — the card-name Link has its own click
    // handler, but clicking anywhere else on the row should go to the
    // detail page.
    await userEvent.click(screen.getByText("Marketing Maggie"));

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.adminToolsNotificationDetail(11),
    );
  });

  it("shows 'No results' when the list is empty", async () => {
    setup({ notifications: [] });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("No results")).toBeInTheDocument();
  });
});
