import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  setupAdminNotificationDetailEndpoint,
  setupAdminNotificationDetailErrorEndpoint,
  setupBulkNotificationActionEndpoint,
} from "__support__/server-mocks/notification";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { URL_UPDATE_DEBOUNCE_DELAY } from "metabase/common/hooks/use-url-state";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  AdminNotification,
  NotificationId,
  UserListResult,
} from "metabase-types/api";
import {
  createMockAdminNotification,
  createMockCard,
  createMockCardQueryMetadata,
  createMockNotificationHandlerEmail,
  createMockNotificationHandlerHttp,
  createMockNotificationHandlerSlack,
  createMockNotificationRecipientUser,
  createMockUserInfo,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { NotificationsAdminPage } from "./NotificationsAdminPage";
import { PAGE_SIZE } from "./constants";

const PATHNAME = "/monitor/notifications";

const ANN = createMockUserInfo({
  id: 1,
  first_name: "Ann",
  last_name: "Admin",
  common_name: "Ann Admin",
});
const BOB = createMockUserInfo({
  id: 2,
  first_name: "Bob",
  last_name: "Boss",
  common_name: "Bob Boss",
});

const notification1 = createMockAdminNotification({ id: 1, creator: ANN });
const notification2 = createMockAdminNotification({ id: 2, creator: BOB });
const webhookNotification = createMockAdminNotification({
  id: 99,
  creator: ANN,
  handlers: [createMockNotificationHandlerHttp()],
  payload: {
    id: 7,
    card_id: 1,
    card: createMockCard({ id: 1, name: "Webhook Alert" }),
    send_once: false,
    send_condition: "has_result",
  },
});
const multiHandlerNotification = createMockAdminNotification({
  id: 50,
  creator: ANN,
  handlers: [
    createMockNotificationHandlerEmail({
      id: 21,
      recipients: [
        createMockNotificationRecipientUser({
          id: 1,
          user_id: 3,
          user: createMockUserInfo({
            id: 3,
            common_name: "Carol Carter",
            email: "carol@example.com",
          }),
        }),
      ],
    }),
    createMockNotificationHandlerEmail({
      id: 22,
      recipients: [
        createMockNotificationRecipientUser({
          id: 2,
          user_id: 4,
          user: createMockUserInfo({
            id: 4,
            common_name: "Dave Diaz",
            email: "dave@example.com",
          }),
        }),
      ],
    }),
    createMockNotificationHandlerSlack({
      id: 23,
      recipients: [
        {
          type: "notification-recipient/raw-value",
          id: 3,
          details: { value: "#alerts" },
        },
      ],
    }),
    createMockNotificationHandlerHttp({ id: 24 }),
  ],
  payload: {
    id: 8,
    card_id: 1,
    card: createMockCard({ id: 1, name: "Multi Channel Alert" }),
    send_once: false,
    send_condition: "has_result",
  },
});

type SetupOpts = {
  notifications?: AdminNotification[];
  total?: number;
  failingCount?: number;
  ownerlessCount?: number;
  users?: UserListResult[];
  initialRoute?: string;
  cardDelay?: number;
  detailDelay?: number;
  detailErrorId?: NotificationId;
  failingCountError?: boolean;
};

const setup = ({
  notifications = [notification1],
  total = notifications.length,
  failingCount = 0,
  ownerlessCount = 0,
  users = [],
  initialRoute = PATHNAME,
  cardDelay,
  detailDelay,
  detailErrorId,
  failingCountError = false,
}: SetupOpts = {}) => {
  fetchMock.get("path:/api/notification/admin", (call) => {
    const params = new URL(call.url).searchParams;
    if (
      params.get("limit") === "1" &&
      params.get("last_check_status") === "failing"
    ) {
      return failingCountError
        ? { status: 500, body: { message: "Count failed" } }
        : { data: [], total: failingCount, limit: 1, offset: 0 };
    }
    if (params.get("limit") === "1" && params.get("creatorless") === "true") {
      return { data: [], total: ownerlessCount, limit: 1, offset: 0 };
    }
    return { data: notifications, total, limit: PAGE_SIZE, offset: 0 };
  });

  setupBulkNotificationActionEndpoint();
  setupUsersEndpoints(users);

  const card = createMockCard({ id: 1 });
  if (cardDelay !== undefined) {
    fetchMock.get(`path:/api/card/${card.id}`, card, { delay: cardDelay });
  } else {
    setupCardEndpoints(card);
  }
  setupCardQueryMetadataEndpoint(card, createMockCardQueryMetadata());

  notifications.forEach((notification) =>
    detailDelay
      ? setupAdminNotificationDetailEndpoint(
          { ...notification, check_history: [], send_history: [] },
          { delay: detailDelay },
        )
      : setupAdminNotificationDetailEndpoint(notification),
  );
  if (detailErrorId !== undefined) {
    setupAdminNotificationDetailErrorEndpoint(detailErrorId);
  }

  return renderWithProviders(
    <Route
      path="/monitor/notifications"
      element={
        <MonitorContent>
          <NotificationsAdminPage />
        </MonitorContent>
      }
    >
      <Route path=":notificationId" />
    </Route>,
    { withRouter: true, initialRoute },
  );
};

const getListCalls = () =>
  fetchMock.callHistory
    .calls("path:/api/notification/admin")
    .filter(
      (call) =>
        new URL(call.url).searchParams.get("limit") === String(PAGE_SIZE),
    );

const getFailingCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/notification/admin").filter((call) => {
    const params = new URL(call.url).searchParams;
    return (
      params.get("limit") === "1" &&
      params.get("last_check_status") === "failing"
    );
  });

const getBulkPosts = async () =>
  (await findRequests("POST")).filter((request) =>
    request.url.includes("/api/notification/admin/bulk"),
  );

describe("NotificationsAdminPage", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    mockGetBoundingClientRect({ height: 800, width: 1000 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("rendering", () => {
    it("shows a loader and then renders the table", async () => {
      setup();
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      await waitForLoaderToBeRemoved();
      expect(
        screen.getByTestId("notifications-admin-table"),
      ).toBeInTheDocument();
    });

    it("renders a row per notification with its owner and question", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForLoaderToBeRemoved();

      const row1 = await screen.findByTestId("notification-row-1");
      const row2 = await screen.findByTestId("notification-row-2");

      expect(within(row1).getByText("Ann Admin")).toBeInTheDocument();
      expect(within(row1).getByText("#1")).toBeInTheDocument();
      expect(within(row2).getByText("Bob Boss")).toBeInTheDocument();
    });

    it("counts webhook handlers as configured channels", async () => {
      setup({ notifications: [webhookNotification] });
      await waitForLoaderToBeRemoved();

      const row = await screen.findByTestId("notification-row-99");
      expect(within(row).getByText("Webhook Alert")).toBeInTheDocument();
      expect(within(row).getByText("1")).toBeInTheDocument();
      expect(within(row).queryByText("0")).not.toBeInTheDocument();

      await userEvent.click(row);

      expect(await screen.findByText("1 webhook")).toBeInTheDocument();
      expect(screen.queryByText("No channels")).not.toBeInTheDocument();
    });

    it("merges multiple handlers across and within channels", async () => {
      setup({ notifications: [multiHandlerNotification] });
      await waitForLoaderToBeRemoved();

      const row = await screen.findByTestId("notification-row-50");
      expect(within(row).getByText("Multi Channel Alert")).toBeInTheDocument();
      expect(within(row).getByText("2")).toBeInTheDocument();

      await userEvent.click(row);

      expect(
        await screen.findByText(
          "2 email recipients, 1 Slack channel, 1 webhook",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Carol Carter")).toBeInTheDocument();
      expect(screen.getByText("Dave Diaz")).toBeInTheDocument();
      expect(screen.getByText("#alerts")).toBeInTheDocument();
    });

    it("shows an empty state when there are no notifications", async () => {
      setup({ notifications: [] });
      await waitForLoaderToBeRemoved();
      expect(await screen.findByText("No alerts")).toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    it("hides the tabs when there are no failing or ownerless alerts", async () => {
      setup({ failingCount: 0, ownerlessCount: 0 });
      await waitForLoaderToBeRemoved();
      expect(
        screen.queryByTestId("notifications-admin-tabs"),
      ).not.toBeInTheDocument();
    });

    it("renders failing and ownerless tabs with their counts", async () => {
      setup({ failingCount: 2, ownerlessCount: 3 });
      await waitForLoaderToBeRemoved();

      expect(
        screen.getByTestId("notifications-admin-tab-failing"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("notifications-admin-tab-ownerless"),
      ).toBeInTheDocument();
    });

    it("pushes the selected tab to the URL", async () => {
      const { history } = setup({ failingCount: 2 });
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        screen.getByTestId("notifications-admin-tab-failing"),
      );

      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      await waitFor(() => {
        expect(history?.getCurrentLocation().search).toContain("tab=failing");
      });
    });

    it("redirects away from an empty failing tab", async () => {
      const { history } = setup({
        failingCount: 0,
        initialRoute: `${PATHNAME}?tab=failing`,
      });
      await waitForLoaderToBeRemoved();

      await waitFor(() => {
        expect(history?.getCurrentLocation().search).not.toContain("failing");
      });
    });

    it("counts inactive failing alerts when the status filter includes them", async () => {
      setup({ initialRoute: `${PATHNAME}?active=all` });
      await waitForLoaderToBeRemoved();

      const [countCall] = getFailingCountCalls();
      expect(new URL(countCall.url).searchParams.get("active")).toBeNull();
    });

    it("shows count query errors", async () => {
      setup({ failingCountError: true });

      expect(await screen.findByText("Count failed")).toBeInTheDocument();
    });
  });

  describe("search, sorting and pagination", () => {
    it("pushes the search query to the URL", async () => {
      const { history } = setup();
      await waitForLoaderToBeRemoved();

      await userEvent.type(
        screen.getByPlaceholderText(/Search by question or owner/),
        "sales",
      );
      act(() => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION);
      });

      await waitFor(() => {
        expect(
          getListCalls().some((call) => call.url.includes("query=sales")),
        ).toBe(true);
      });

      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      await waitFor(() => {
        expect(history?.getCurrentLocation().search).toContain("query=sales");
      });
    });

    it("pushes sorting changes to the URL and refetches", async () => {
      const { history } = setup();
      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByRole("columnheader", { name: "ID" }));

      await waitFor(() => {
        expect(
          getListCalls().some((call) => call.url.includes("sort_column=id")),
        ).toBe(true);
      });

      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      await waitFor(() => {
        expect(history?.getCurrentLocation().search).toContain(
          "sort_column=id",
        );
      });
    });

    it("paginates and refetches with the next offset", async () => {
      const { history } = setup({
        notifications: [notification1, notification2],
        total: 120,
      });
      await waitForLoaderToBeRemoved();

      expect(await screen.findByTestId("pagination-total")).toHaveTextContent(
        "120",
      );

      const nextPage = screen.getByRole("button", { name: "Next page" });
      expect(nextPage).toBeEnabled();

      await userEvent.click(nextPage);

      await waitFor(() => {
        expect(
          getListCalls().some((call) => call.url.includes("offset=50")),
        ).toBe(true);
      });

      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      await waitFor(() => {
        expect(history?.getCurrentLocation().search).toContain("page=1");
      });
    });
  });

  describe("selection and bulk actions", () => {
    it("shows the bulk action bar when a row is selected", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForLoaderToBeRemoved();

      const row1 = await screen.findByTestId("notification-row-1");
      await userEvent.click(within(row1).getByRole("checkbox"));

      const bar = screen.getByTestId("toast-card");
      expect(within(bar).getByText("1 alert selected")).toBeInTheDocument();
      expect(
        within(bar).getByRole("button", { name: "Delete" }),
      ).toBeInTheDocument();
      expect(
        within(bar).getByRole("button", { name: "Change owner" }),
      ).toBeInTheDocument();
    });

    it("selects every row with the header checkbox", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select all" }),
      );

      expect(
        within(screen.getByTestId("toast-card")).getByText("2 alerts selected"),
      ).toBeInTheDocument();
    });

    it("selects the keyboard-highlighted row via space", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForLoaderToBeRemoved();

      screen.getByRole("treegrid", { name: "Notifications" }).focus();
      await userEvent.keyboard("{ArrowDown} ");

      const bar = await screen.findByTestId("toast-card");
      expect(within(bar).getByText("1 alert selected")).toBeInTheDocument();
      const row1 = screen.getByTestId("notification-row-1");
      expect(within(row1).getByRole("checkbox")).toBeChecked();
    });

    it("clears the selection with the Clear button", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForLoaderToBeRemoved();

      const row1 = await screen.findByTestId("notification-row-1");
      await userEvent.click(within(row1).getByRole("checkbox"));
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Clear",
        }),
      );

      await waitFor(() => {
        expect(screen.queryByTestId("toast-card")).not.toBeInTheDocument();
      });
    });

    it("clears the selection when navigating to another page", async () => {
      setup({
        notifications: [notification1, notification2],
        total: 120,
      });
      await waitForLoaderToBeRemoved();

      const row1 = await screen.findByTestId("notification-row-1");
      await userEvent.click(within(row1).getByRole("checkbox"));
      expect(screen.getByTestId("toast-card")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Next page" }));

      await waitFor(() => {
        expect(screen.queryByTestId("toast-card")).not.toBeInTheDocument();
      });
    });

    it("removes selected alerts after confirmation", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select all" }),
      );
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Delete",
        }),
      );

      const confirmModal = await screen.findByTestId("confirm-modal");
      await userEvent.click(
        within(confirmModal).getByRole("button", { name: "Delete" }),
      );

      await waitFor(async () => {
        expect(await getBulkPosts()).toHaveLength(1);
      });
      const posts = await getBulkPosts();
      expect(posts[0].body).toEqual({
        notification_ids: [1, 2],
        action: "archive",
      });

      await waitFor(() => {
        expect(screen.queryByTestId("toast-card")).not.toBeInTheDocument();
      });
    });

    it("changes the owner of selected alerts", async () => {
      const newOwner = createMockUserListResult({
        id: 7,
        common_name: "New Owner",
      });
      setup({
        notifications: [notification1, notification2],
        users: [newOwner],
      });
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select all" }),
      );
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Change owner",
        }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText("Select new owner of 2 alerts"),
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByPlaceholderText("Select a user"),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "New Owner" }),
      );

      await userEvent.click(
        within(dialog).getByRole("button", { name: "Change owner" }),
      );

      await waitFor(async () => {
        expect(await getBulkPosts()).toHaveLength(1);
      });
      const posts = await getBulkPosts();
      expect(posts[0].body).toEqual({
        notification_ids: [1, 2],
        action: "change-creator",
        creator_id: 7,
      });
    });
  });

  describe("detail sidebar", () => {
    it("opens the sidebar on row click and closes it again", async () => {
      const { history } = setup({ notifications: [notification1] });
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByTestId("notification-row-1"));

      expect(history?.getCurrentLocation().pathname).toBe(`${PATHNAME}/1`);
      expect(await screen.findByText("Alert 1")).toBeInTheDocument();

      const sidebarRegion = screen.getByTestId("monitor-sidebar-region");
      expect(
        within(sidebarRegion).getByTestId("notification-detail-sidebar"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("monitor-main")).not.toContainElement(
        sidebarRegion,
      );

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe(PATHNAME);
      });
      await waitFor(() => {
        expect(screen.queryByText("Alert 1")).not.toBeInTheDocument();
      });
    });

    it("clears the alert id from the URL when the open alert is deleted", async () => {
      const { history } = setup({
        notifications: [notification1, notification2],
      });
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByTestId("notification-row-1"));
      expect(history?.getCurrentLocation().pathname).toBe(`${PATHNAME}/1`);
      expect(await screen.findByText("Alert 1")).toBeInTheDocument();

      const row1 = await screen.findByTestId("notification-row-1");
      await userEvent.click(within(row1).getByRole("checkbox"));
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Delete",
        }),
      );

      const confirmModal = await screen.findByTestId("confirm-modal");
      await userEvent.click(
        within(confirmModal).getByRole("button", { name: "Delete" }),
      );

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe(PATHNAME);
      });
      await waitFor(() => {
        expect(screen.queryByText("Alert 1")).not.toBeInTheDocument();
      });
    });

    it("deletes the open alert from the sidebar menu", async () => {
      const { history } = setup({ notifications: [notification1] });
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByTestId("notification-row-1"));
      expect(await screen.findByText("Alert 1")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "More actions" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Delete alert/ }),
      );

      const confirmModal = await screen.findByTestId("confirm-modal");
      await userEvent.click(
        within(confirmModal).getByRole("button", { name: "Delete" }),
      );

      await waitFor(async () => {
        expect(await getBulkPosts()).toHaveLength(1);
      });
      const posts = await getBulkPosts();
      expect(posts[0].body).toEqual({
        notification_ids: [1],
        action: "archive",
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe(PATHNAME);
      });
    });

    it("copies the alert link to the clipboard from the sidebar menu", async () => {
      setup({ notifications: [notification1] });
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByTestId("notification-row-1"));
      expect(await screen.findByText("Alert 1")).toBeInTheDocument();

      jest.mocked(navigator.clipboard.writeText).mockClear();

      await userEvent.click(
        screen.getByRole("button", { name: "More actions" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", {
          name: /Copy link to clipboard/,
        }),
      );

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}${PATHNAME}/1`,
      );
    });

    it("keeps the edit action disabled until the question has loaded", async () => {
      setup({ notifications: [notification1], cardDelay: 10_000 });
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByTestId("notification-row-1"));
      expect(await screen.findByText("Alert 1")).toBeInTheDocument();

      expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
      });
    });

    it("points the run-history 'View all' links at the card runs, including today", async () => {
      setup({ notifications: [notification1] });
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByTestId("notification-row-1"));
      expect(await screen.findByText("Alert 1")).toBeInTheDocument();

      const [viewAll] = screen.getAllByRole("link", { name: "View all" });
      const href = viewAll.getAttribute("href") ?? "";
      const params = new URLSearchParams(href.split("?")[1]);

      expect(params.get("run-type")).toBe("alert");
      expect(params.get("entity-type")).toBe("card");
      expect(params.get("entity-id")).toBe("1");
      expect(params.get("started-at")).toBe("past3months");
      expect(params.get("include-today")).toBe("true");
    });

    it("shows loaders in the history sections while the alert detail loads", async () => {
      setup({ notifications: [notification1], detailDelay: 10_000 });
      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByTestId("notification-row-1"));

      expect(await screen.findByText("Check history")).toBeInTheDocument();
      expect(screen.getByText("Send history")).toBeInTheDocument();
      expect(screen.getAllByTestId("run-summary-loader")).toHaveLength(2);
      expect(
        screen.queryByText("No runs in the past 90 days."),
      ).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      await waitFor(() => {
        expect(
          screen.getAllByText("No runs in the past 90 days."),
        ).toHaveLength(2);
      });
      expect(screen.queryAllByTestId("run-summary-loader")).toHaveLength(0);
    });

    it("shows an error when a deep-linked alert cannot be loaded", async () => {
      setup({
        notifications: [],
        initialRoute: `${PATHNAME}/999`,
        detailErrorId: 999,
      });

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    });
  });

  describe("change owner modal", () => {
    it("preselects the owner when a single alert is selected", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForLoaderToBeRemoved();

      const row1 = await screen.findByTestId("notification-row-1");
      await userEvent.click(within(row1).getByRole("checkbox"));
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Change owner",
        }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText("Select new owner of 1 alert"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "Change owner" }),
      ).toBeEnabled();

      await userEvent.click(
        within(dialog).getByPlaceholderText("Select a user"),
      );
      expect(
        await screen.findByRole("option", { name: "Ann Admin" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("starts the owner picker from scratch each time it opens", async () => {
      const newOwner = createMockUserListResult({
        id: 7,
        common_name: "New Owner",
      });
      setup({
        notifications: [notification1, notification2],
        users: [newOwner],
      });
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select all" }),
      );
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Change owner",
        }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("button", { name: "Change owner" }),
      ).toBeDisabled();

      await userEvent.click(
        within(dialog).getByPlaceholderText("Select a user"),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "New Owner" }),
      );
      expect(
        within(dialog).getByRole("button", { name: "Change owner" }),
      ).toBeEnabled();

      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Change owner",
        }),
      );

      const reopened = await screen.findByRole("dialog");
      expect(
        within(reopened).getByRole("button", { name: "Change owner" }),
      ).toBeDisabled();
    });

    it("keeps the picked user selected when the dropdown is reopened", async () => {
      const newOwner = createMockUserListResult({
        id: 7,
        common_name: "New Owner",
      });
      setup({
        notifications: [notification1, notification2],
        users: [newOwner],
      });
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select all" }),
      );
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Change owner",
        }),
      );

      const dialog = await screen.findByRole("dialog");
      await userEvent.click(
        within(dialog).getByPlaceholderText("Select a user"),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "New Owner" }),
      );

      await userEvent.click(
        within(dialog).getByPlaceholderText("Select a user"),
      );
      expect(
        await screen.findByRole("option", { name: "New Owner" }),
      ).toHaveAttribute("aria-selected", "true");
    });
  });
});
