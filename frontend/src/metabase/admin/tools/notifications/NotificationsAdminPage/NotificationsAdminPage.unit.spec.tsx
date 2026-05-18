import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { Location } from "history";
import { Route } from "react-router";

import {
  setupTaskRunsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupAdminListNotificationsEndpoint } from "__support__/server-mocks/notification";
import {
  act,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { URL_UPDATE_DEBOUNCE_DELAY } from "metabase/common/hooks/use-url-state";
import { createMockLocation } from "metabase/redux/store/mocks";
import * as Urls from "metabase/urls";
import type { AdminNotification } from "metabase-types/api";
import {
  createMockAdminNotification,
  createMockCard,
  createMockNotificationHandlerEmail,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { NotificationsAdminPage } from "./NotificationsAdminPage";

const PATHNAME = Urls.adminToolsNotifications();

interface SetupOpts {
  notifications?: AdminNotification[];
  location?: Location;
}

const setup = ({
  notifications = [],
  location = createMockLocation({ pathname: PATHNAME }),
}: SetupOpts = {}) => {
  setupUsersEndpoints([]);
  setupTaskRunsEndpoints({ data: [], limit: 20, offset: 0, total: 0 });
  fetchMock.get("path:/api/search", { data: [], total: 0 });
  setupAdminListNotificationsEndpoint(notifications);

  return renderWithProviders(
    <>
      <Route path={PATHNAME} component={NotificationsAdminPage} />
      <Route
        path={`${PATHNAME}/:notificationId`}
        component={NotificationsAdminPage}
      />
    </>,
    {
      initialRoute: `${location.pathname}${location.search}`,
      withRouter: true,
    },
  );
};

const alertFor = (overrides: Partial<AdminNotification>): AdminNotification =>
  createMockAdminNotification({
    payload: {
      id: 1,
      card_id: 42,
      send_once: false,
      send_condition: "has_result",
      created_at: "2025-01-07T18:40:47.245205+03:00",
      updated_at: "2025-01-07T18:40:47.245205+03:00",
      card: createMockCard({ id: 42, name: "Sales report" }),
    },
    owner: createMockUserInfo({
      id: 7,
      common_name: "Marketing Maggie",
      email: "maggie@example.com",
      is_active: true,
    }),
    handlers: [createMockNotificationHandlerEmail()],
    ...overrides,
  });

describe("NotificationsAdminPage", () => {
  it("renders a row per notification with card name and owner", async () => {
    setup({
      notifications: [alertFor({ id: 11 })],
    });

    await waitForLoaderToBeRemoved();

    const row = screen.getByTestId("notification-row-11");
    expect(within(row).getByText("Sales report")).toBeInTheDocument();
    expect(within(row).getByText("Marketing Maggie")).toBeInTheDocument();
  });

  it("renders the search input with the new placeholder", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByPlaceholderText("Search by question or owner…"),
    ).toBeInTheDocument();
  });

  it("opens the filter popover with channel pills", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByRole("button", { name: "Show filters" }));

    expect(screen.getByText("Channel")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Webhook")).toBeInTheDocument();
  });

  it("navigates to the detail page when a row is clicked", async () => {
    const { history } = setup({
      notifications: [alertFor({ id: 11 })],
    });
    await waitForLoaderToBeRemoved();

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

  describe("URL state", () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("reflects the search query in the URL after the debounce", async () => {
      const { history } = setup();
      await waitForLoaderToBeRemoved();

      await userEvent.type(
        screen.getByPlaceholderText("Search by question or owner…"),
        "sales",
      );

      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });

      expect(history?.getCurrentLocation().search).toContain("query=sales");
    });
  });
});
