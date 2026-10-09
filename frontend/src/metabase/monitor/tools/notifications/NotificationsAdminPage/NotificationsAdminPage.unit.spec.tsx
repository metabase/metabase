import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import {
  findRequests,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  setupAdminListNotificationsEndpoint,
  setupAdminNotificationCountsEndpoint,
  setupAdminNotificationCountsErrorEndpoint,
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
  within,
} from "__support__/ui";
import { URL_UPDATE_DEBOUNCE_DELAY } from "metabase/common/hooks/use-url-state";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { defer } from "metabase/utils/promise";
import type {
  AdminNotification,
  AdminNotificationCountsResponse,
  AdminNotificationListResponse,
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
  allCount?: number;
  failingCount?: number;
  ownerlessCount?: number;
  users?: UserListResult[];
  initialRoute?: string;
  cardDelay?: number;
  detailDelay?: number;
  detailErrorId?: NotificationId;
  countsError?: boolean;
  countsDelay?: number;
  refetchDelay?: number;
  getListResponse?: (
    call: CallLog,
  ) => AdminNotificationListResponse | Promise<AdminNotificationListResponse>;
};

const setup = ({
  notifications = [notification1],
  total = notifications.length,
  allCount = total,
  failingCount = 0,
  ownerlessCount = 0,
  users = [],
  initialRoute = PATHNAME,
  cardDelay,
  detailDelay,
  detailErrorId,
  countsError = false,
  countsDelay,
  refetchDelay,
  getListResponse,
}: SetupOpts = {}) => {
  let listCallCount = 0;

  if (countsError) {
    setupAdminNotificationCountsErrorEndpoint();
  } else {
    setupAdminNotificationCountsEndpoint(
      { all: allCount, failing: failingCount, ownerless: ownerlessCount },
      { delay: countsDelay, name: "admin-notification-counts" },
    );
  }

  setupAdminListNotificationsEndpoint((call) => {
    if (getListResponse) {
      return getListResponse(call);
    }
    const page: AdminNotificationListResponse = {
      data: notifications,
      total,
      limit: PAGE_SIZE,
      offset: 0,
    };
    listCallCount += 1;
    // Keep every refetch except the initial load in flight, so tests can
    // observe the loading state the grid.
    return refetchDelay !== undefined && listCallCount > 1
      ? new Promise<AdminNotificationListResponse>((resolve) =>
          setTimeout(() => resolve(page), refetchDelay),
        )
      : page;
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

const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/notification/admin/counts");

const getBulkPosts = async () =>
  (await findRequests("POST")).filter((request) =>
    request.url.includes("/api/notification/admin/bulk"),
  );

// Tabs, filters, and the table skeleton render immediately (no page-blocking
// loader), so tests wait for the real grid to replace the skeleton instead.
const waitForTableToLoad = () => screen.findByRole("treegrid");

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
    it("shows tabs, filters, and a grid skeleton immediately, then renders the table", async () => {
      setup();

      expect(
        screen.getByTestId("notifications-admin-tabs"),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/Search by question or owner/),
      ).toBeInTheDocument();
      expect(screen.getByTestId("notifications-admin-table")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();

      await waitForTableToLoad();
      expect(screen.getByTestId("notifications-admin-table")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    });

    it("hides pagination until the grid has loaded", async () => {
      setup({ notifications: [notification1, notification2], total: 120 });

      expect(screen.queryByTestId("pagination-total")).not.toBeInTheDocument();

      await waitForTableToLoad();
      expect(await screen.findByTestId("pagination-total")).toHaveTextContent(
        "120",
      );
    });

    it.each(["Failing", "Ownerless"])(
      "shows a skeleton instead of stale rows while the uncached %s tab loads",
      async (tab) => {
        const pending = defer<AdminNotificationListResponse>();
        const nextNotification = createMockAdminNotification({
          id: 2,
          creator: null,
        });
        const nextPage: AdminNotificationListResponse = {
          data: [nextNotification],
          total: 1,
          limit: PAGE_SIZE,
          offset: 0,
        };
        setup({
          total: 120,
          failingCount: 1,
          ownerlessCount: 1,
          initialRoute: `${PATHNAME}?sort_column=last_check`,
          getListResponse: ({ url }) => {
            const params = new URL(url).searchParams;
            return params.get("creatorless") === "true" ||
              params.get("last_check_status") === "failing"
              ? pending.promise
              : {
                  data: [notification1],
                  total: 120,
                  limit: PAGE_SIZE,
                  offset: 0,
                };
          },
        });
        try {
          await waitForTableToLoad();
          expect(screen.getByTestId("notification-row-1")).toBeInTheDocument();
          await userEvent.click(screen.getByRole("button", { name: tab }));
          await waitFor(() => expect(getListCalls()).toHaveLength(2));
          expect(
            screen.getByTestId("notifications-admin-table"),
          ).toHaveAttribute("aria-busy", "true");
          expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
          expect(
            screen.queryByTestId("notification-row-1"),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByTestId("pagination-total"),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByTestId("loading-overlay"),
          ).not.toBeInTheDocument();
          act(() => pending.resolve(nextPage));
          expect(
            await screen.findByTestId("notification-row-2"),
          ).toBeInTheDocument();
          await userEvent.click(
            screen.getByRole("button", { name: "All alerts" }),
          );
          expect(screen.getByTestId("notification-row-1")).toBeInTheDocument();
          expect(screen.getByRole("treegrid")).toBeInTheDocument();
          expect(
            screen.getByTestId("notifications-admin-table"),
          ).toHaveAttribute("aria-busy", "false");
          expect(getListCalls()).toHaveLength(2);
        } finally {
          pending.resolve(nextPage);
        }
      },
    );

    it("retains rows under the loading overlay during a same-query mutation refresh", async () => {
      const pending = defer<AdminNotificationListResponse>();
      const initialPage: AdminNotificationListResponse = {
        data: [notification1],
        total: 1,
        limit: PAGE_SIZE,
        offset: 0,
      };
      const refreshedPage: AdminNotificationListResponse = {
        data: [],
        total: 0,
        limit: PAGE_SIZE,
        offset: 0,
      };
      let calls = 0;
      setup({
        getListResponse: () => (++calls === 1 ? initialPage : pending.promise),
      });
      try {
        await waitForTableToLoad();
        await userEvent.click(
          within(screen.getByTestId("notification-row-1")).getByRole(
            "checkbox",
          ),
        );
        await userEvent.click(
          within(screen.getByTestId("toast-card")).getByRole("button", {
            name: "Delete",
          }),
        );
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Delete" }),
        );
        expect(
          await screen.findByTestId("loading-overlay"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("notification-row-1")).toBeInTheDocument();
        expect(screen.getByRole("treegrid")).toBeInTheDocument();
        expect(screen.getByTestId("notifications-admin-table")).toHaveAttribute(
          "aria-busy",
          "true",
        );
        expect(getListCalls()).toHaveLength(2);
        act(() => pending.resolve(refreshedPage));
        expect(await screen.findByText("No alerts")).toBeInTheDocument();
        expect(
          screen.queryByTestId("notification-row-1"),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("loading-overlay")).not.toBeInTheDocument();
      } finally {
        pending.resolve(refreshedPage);
      }
    });

    it("renders a row per notification with its owner and question", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForTableToLoad();

      const row1 = await screen.findByTestId("notification-row-1");
      const row2 = await screen.findByTestId("notification-row-2");

      expect(within(row1).getByText("Ann Admin")).toBeInTheDocument();
      expect(within(row1).getByText("#1")).toBeInTheDocument();
      expect(within(row2).getByText("Bob Boss")).toBeInTheDocument();
    });

    it("counts webhook handlers as configured channels", async () => {
      setup({ notifications: [webhookNotification] });
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      await waitForTableToLoad();
      expect(await screen.findByText("No alerts")).toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    it("shows tabs with a loading placeholder before counts resolve", async () => {
      setup({ failingCount: 0, ownerlessCount: 0 });

      const failingTab = screen.getByTestId("notifications-admin-tab-failing");
      const ownerlessTab = screen.getByTestId(
        "notifications-admin-tab-ownerless",
      );
      expect(within(failingTab).queryByText(/\d/)).not.toBeInTheDocument();
      expect(within(ownerlessTab).queryByText(/\d/)).not.toBeInTheDocument();

      await waitForTableToLoad();
      expect(within(failingTab).getByText("0")).toBeInTheDocument();
      expect(within(ownerlessTab).getByText("0")).toBeInTheDocument();
    });

    it("always shows all three tabs, even when a tab has no alerts", async () => {
      setup({ failingCount: 0, ownerlessCount: 0 });
      await waitForTableToLoad();

      expect(
        screen.getByTestId("notifications-admin-tab-all"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("notifications-admin-tab-failing"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("notifications-admin-tab-ownerless"),
      ).toBeInTheDocument();
    });

    it("renders failing and ownerless tabs with their counts", async () => {
      setup({ failingCount: 2, ownerlessCount: 3 });
      await waitForTableToLoad();

      const failingTab = screen.getByTestId("notifications-admin-tab-failing");
      const ownerlessTab = screen.getByTestId(
        "notifications-admin-tab-ownerless",
      );
      expect(within(failingTab).getByText("2")).toBeInTheDocument();
      expect(within(ownerlessTab).getByText("3")).toBeInTheDocument();
    });

    it("keeps the All tab's true total after switching to a filtered tab", async () => {
      setup({ allCount: 137, failingCount: 9, ownerlessCount: 33 });
      await waitForTableToLoad();

      const allTab = screen.getByTestId("notifications-admin-tab-all");
      expect(within(allTab).getByText("137")).toBeInTheDocument();

      await userEvent.click(
        screen.getByTestId("notifications-admin-tab-failing"),
      );
      await waitForTableToLoad();

      expect(within(allTab).getByText("137")).toBeInTheDocument();
    });

    it("reuses the section counts when switching tabs repeatedly", async () => {
      const { router } = setup({
        allCount: 137,
        failingCount: 9,
        ownerlessCount: 33,
      });
      await waitForTableToLoad();
      expect(
        await within(
          screen.getByRole("button", { name: "All alerts" }),
        ).findByText("137"),
      ).toBeVisible();

      for (let visit = 0; visit < 2; visit++) {
        for (const [label, tab] of [
          ["Failing", "failing"],
          ["Ownerless", "ownerless"],
          ["All alerts", "all"],
        ]) {
          await userEvent.click(screen.getByRole("button", { name: label }));
          await waitFor(() => {
            expect(
              new URLSearchParams(router?.location.search).get("tab") ?? "all",
            ).toBe(tab);
          });
          await waitForTableToLoad();
        }
      }
      expect(getCountCalls()).toHaveLength(1);
    });

    it("pushes the selected tab to the URL", async () => {
      const { router } = setup({ failingCount: 2 });
      await waitForTableToLoad();

      await userEvent.click(
        screen.getByTestId("notifications-admin-tab-failing"),
      );

      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      await waitFor(() => {
        expect(router?.location.search).toContain("tab=failing");
      });
    });

    it("does not redirect away from a failing tab with no alerts", async () => {
      const { router } = setup({
        failingCount: 0,
        initialRoute: `${PATHNAME}?tab=failing`,
      });
      await waitForTableToLoad();

      expect(router?.location.search).toContain("tab=failing");
      expect(
        within(screen.getByTestId("notifications-admin-tab-failing")).getByText(
          "0",
        ),
      ).toBeInTheDocument();
    });

    it("does not redirect away from an ownerless tab with no alerts", async () => {
      const { router } = setup({
        ownerlessCount: 0,
        initialRoute: `${PATHNAME}?tab=ownerless`,
      });
      await waitForTableToLoad();

      expect(router?.location.search).toContain("tab=ownerless");
      expect(
        within(
          screen.getByTestId("notifications-admin-tab-ownerless"),
        ).getByText("0"),
      ).toBeInTheDocument();
    });

    it.each(["false", "all"])(
      "keeps counters on the default population when the table's active filter is %s",
      async (active) => {
        setup({ initialRoute: `${PATHNAME}?active=${active}`, allCount: 23 });
        await waitForTableToLoad();

        expect(
          await within(
            screen.getByRole("button", { name: "All alerts" }),
          ).findByText("23"),
        ).toBeInTheDocument();
        expect(getCountCalls()).toHaveLength(1);
        expect(new URL(getCountCalls()[0].url).search).toBe("");
        expect(
          fetchMock.callHistory
            .calls("path:/api/notification/admin")
            .every(
              (call) =>
                new URL(call.url).searchParams.get("limit") ===
                String(PAGE_SIZE),
            ),
        ).toBe(true);
      },
    );

    it("keeps navigation and the table usable when counters fail", async () => {
      setup({ countsError: true });
      await waitForTableToLoad();

      await waitFor(() => {
        expect(getCountCalls()).toHaveLength(1);
        expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0);
      });
      for (const label of ["All alerts", "Failing", "Ownerless"]) {
        const tab = screen.getByRole("button", { name: label });
        expect(tab).toBeEnabled();
        expect(within(tab).queryByText(/\d/)).not.toBeInTheDocument();
      }
    });

    it("does not wait for counters to show the alert table", async () => {
      setup({ countsDelay: 1000 });
      await waitForTableToLoad();

      expect(screen.getAllByTestId("tab-count-skeleton")).toHaveLength(3);
      expect(screen.getByRole("button", { name: "Failing" })).toBeEnabled();
      act(() => jest.advanceTimersByTime(1000));
      expect(
        await within(
          screen.getByRole("button", { name: "All alerts" }),
        ).findByText("1"),
      ).toBeInTheDocument();
    });

    it("refreshes counters after archiving and keeps the previous count until the response arrives", async () => {
      setup({ allCount: 9 });
      await waitForTableToLoad();
      const allTab = screen.getByRole("button", { name: "All alerts" });
      expect(await within(allTab).findByText("9")).toBeInTheDocument();
      const countsRefetch = defer<AdminNotificationCountsResponse>();
      fetchMock.modifyRoute("admin-notification-counts", {
        response: () => countsRefetch.promise,
      });

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select all" }),
      );
      await userEvent.click(
        within(screen.getByTestId("toast-card")).getByRole("button", {
          name: "Delete",
        }),
      );
      await userEvent.click(
        within(await screen.findByTestId("confirm-modal")).getByRole("button", {
          name: "Delete",
        }),
      );

      await waitFor(() => expect(getCountCalls()).toHaveLength(2));
      expect(within(allTab).getByText("9")).toBeInTheDocument();
      expect(
        within(allTab).queryByTestId("tab-count-skeleton"),
      ).not.toBeInTheDocument();
      act(() => countsRefetch.resolve({ all: 8, failing: 0, ownerless: 0 }));
      expect(await within(allTab).findByText("8")).toBeInTheDocument();
    });
  });

  describe("search, sorting and pagination", () => {
    it("pushes the search query to the URL", async () => {
      const { router } = setup();
      await waitForTableToLoad();

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
        expect(router?.location.search).toContain("query=sales");
      });
    });

    it("pushes sorting changes to the URL and refetches", async () => {
      const { router } = setup();
      await waitForTableToLoad();

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
        expect(router?.location.search).toContain("sort_column=id");
      });
    });

    it("paginates Ownerless alerts and preserves its filters and page boundaries", async () => {
      const ownerless = Array.from({ length: 42 }, (_, index) =>
        createMockAdminNotification({
          id: index + 1,
          creator_id: null,
          creator: null,
        }),
      );
      const all = [
        ...ownerless,
        createMockAdminNotification({ id: 99, creator: ANN }),
      ];
      const { router } = setup({
        notifications: all,
        total: 43,
        ownerlessCount: 42,
        initialRoute: `${PATHNAME}?tab=ownerless`,
        getListResponse: ({ url }) => {
          const params = new URL(url).searchParams;
          const rows = params.get("creatorless") === "true" ? ownerless : all;
          const offset = Number(params.get("offset"));
          const limit = Number(params.get("limit"));
          return {
            data: rows.slice(offset, offset + limit),
            total: rows.length,
            limit,
            offset,
          };
        },
      });
      await waitForTableToLoad();
      expect(screen.getByTestId("pagination-total")).toHaveTextContent("42");
      expect(
        screen.getByRole("button", { name: "Previous page" }),
      ).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(
        await screen.findByTestId("notification-row-26"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("notification-row-1"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Previous page" }),
      ).toBeEnabled();
      expect(getListCalls()).toHaveLength(2);
      const secondPageParams = new URL(getListCalls()[1].url).searchParams;
      expect(secondPageParams.get("limit")).toBe("25");
      expect(secondPageParams.get("offset")).toBe("25");
      expect(secondPageParams.get("active")).toBe("true");
      expect(secondPageParams.get("creatorless")).toBe("true");
      await userEvent.click(
        screen.getByRole("button", { name: "Previous page" }),
      );
      expect(
        await screen.findByTestId("notification-row-1"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Previous page" }),
      ).toBeDisabled();
      expect(getListCalls()).toHaveLength(2);
      await userEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(
        await screen.findByTestId("notification-row-26"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "All alerts" }));
      await waitFor(() => {
        const params = new URLSearchParams(router?.location.search);
        expect(params.get("page") ?? "0").toBe("0");
        expect(params.get("tab") ?? "all").toBe("all");
      });
      expect(
        await screen.findByTestId("notification-row-1"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("pagination-total")).toHaveTextContent("43");
    });

    it.each([0, 25])(
      "hides the Ownerless pager when its %i alerts fit on one page",
      async (total) => {
        setup({
          notifications: Array.from({ length: total }, (_, index) =>
            createMockAdminNotification({
              id: index + 1,
              creator_id: null,
              creator: null,
            }),
          ),
          total,
          ownerlessCount: total,
          initialRoute: `${PATHNAME}?tab=ownerless`,
        });
        await waitForTableToLoad();
        expect(
          screen.queryByTestId("pagination-total"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Next page" }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Previous page" }),
        ).not.toBeInTheDocument();
      },
    );

    it("paginates and refetches with the next offset", async () => {
      const { router } = setup({
        notifications: [notification1, notification2],
        total: 120,
      });
      await waitForTableToLoad();

      expect(await screen.findByTestId("pagination-total")).toHaveTextContent(
        "120",
      );

      const nextPage = screen.getByRole("button", { name: "Next page" });
      expect(nextPage).toBeEnabled();

      await userEvent.click(nextPage);

      await waitFor(() => {
        expect(
          getListCalls().some((call) => call.url.includes("offset=25")),
        ).toBe(true);
      });

      act(() => {
        jest.advanceTimersByTime(URL_UPDATE_DEBOUNCE_DELAY);
      });
      await waitFor(() => {
        expect(router?.location.search).toContain("page=1");
      });
    });

    it("shows a skeleton while uncached sorting results are in flight", async () => {
      setup({
        notifications: [notification1, notification2],
        refetchDelay: 10_000,
      });
      await waitForTableToLoad();

      const table = screen.getByTestId("notifications-admin-table");
      expect(
        within(table).queryByTestId("loading-overlay"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("columnheader", { name: "ID" }));

      await waitFor(() => expect(getListCalls()).toHaveLength(2));
      expect(
        within(table).queryByTestId("loading-overlay"),
      ).not.toBeInTheDocument();
      expect(table).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("notification-row-1"),
      ).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
      expect(screen.getByTestId("notification-row-1")).toBeInTheDocument();
    });

    it("keeps search loading feedback in the grid instead of the search box", async () => {
      setup({ refetchDelay: 10_000 });
      await waitForTableToLoad();

      const searchInput = screen.getByPlaceholderText(
        /Search by question or owner/,
      );

      await userEvent.type(searchInput, "sales");
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION);
      });

      const table = screen.getByTestId("notifications-admin-table");
      await waitFor(() => expect(getListCalls()).toHaveLength(2));
      expect(
        within(table).queryByTestId("loading-overlay"),
      ).not.toBeInTheDocument();
      expect(table).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

      await waitFor(() => {
        expect(
          getListCalls().some((call) => call.url.includes("query=sales")),
        ).toBe(true);
      });

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
      expect(screen.getByTestId("notification-row-1")).toBeInTheDocument();
    });
  });

  describe("selection and bulk actions", () => {
    it("shows the bulk action bar when a row is selected", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForTableToLoad();

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
      await waitForTableToLoad();

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select all" }),
      );

      expect(
        within(screen.getByTestId("toast-card")).getByText("2 alerts selected"),
      ).toBeInTheDocument();
    });

    it("selects the keyboard-highlighted row via space", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForTableToLoad();

      screen.getByRole("treegrid", { name: "Notifications" }).focus();
      await userEvent.keyboard("{ArrowDown} ");

      const bar = await screen.findByTestId("toast-card");
      expect(within(bar).getByText("1 alert selected")).toBeInTheDocument();
      const row1 = screen.getByTestId("notification-row-1");
      expect(within(row1).getByRole("checkbox")).toBeChecked();
    });

    it("clears the selection with the Clear button", async () => {
      setup({ notifications: [notification1, notification2] });
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      const { router } = setup({ notifications: [notification1] });
      await waitForTableToLoad();

      await userEvent.click(await screen.findByTestId("notification-row-1"));

      expect(router?.location.pathname).toBe(`${PATHNAME}/1`);
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
        expect(router?.location.pathname).toBe(PATHNAME);
      });
      await waitFor(() => {
        expect(screen.queryByText("Alert 1")).not.toBeInTheDocument();
      });
    });

    it("clears the alert id from the URL when the open alert is deleted", async () => {
      const { router } = setup({
        notifications: [notification1, notification2],
      });
      await waitForTableToLoad();

      await userEvent.click(await screen.findByTestId("notification-row-1"));
      expect(router?.location.pathname).toBe(`${PATHNAME}/1`);
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
        expect(router?.location.pathname).toBe(PATHNAME);
      });
      await waitFor(() => {
        expect(screen.queryByText("Alert 1")).not.toBeInTheDocument();
      });
    });

    it("deletes the open alert from the sidebar menu", async () => {
      const { router } = setup({ notifications: [notification1] });
      await waitForTableToLoad();

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
        expect(router?.location.pathname).toBe(PATHNAME);
      });
    });

    it("copies the alert link to the clipboard from the sidebar menu", async () => {
      setup({ notifications: [notification1] });
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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

    it("keeps the edit action disabled while a directly-linked alert is still loading", async () => {
      setup({
        notifications: [notification1],
        initialRoute: `${PATHNAME}/1`,
        cardDelay: 10_000,
      });
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
      await waitForTableToLoad();

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
