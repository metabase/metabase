import dayjs from "dayjs";

import type { NotificationChannelType } from "metabase-types/api";

import { PAGE_SIZE } from "./constants";
import type { NotificationsUrlState } from "./types";
import {
  buildListParams,
  formatRelativeDate,
  getChannelIconName,
  getChannelLabel,
  urlStateConfig,
} from "./utils";

const DEFAULT_STATE: NotificationsUrlState = {
  page: 0,
  active: true,
  query: "",
  channel: [],
  last_send_status: null,
  creator_active: null,
  recipient_email: "",
  tab: "all",
  sort_column: "last_send",
  sort_direction: "desc",
};

const POPULATED_STATE: NotificationsUrlState = {
  page: 2,
  active: false,
  query: "sales",
  channel: ["channel/email", "channel/http"],
  last_send_status: "failing",
  creator_active: false,
  recipient_email: "owner@example.com",
  tab: "failing",
  sort_column: "id",
  sort_direction: "asc",
};

describe("NotificationsAdminPage/utils", () => {
  describe("urlStateConfig.parse", () => {
    it("returns defaults for an empty query", () => {
      expect(urlStateConfig.parse({})).toEqual(DEFAULT_STATE);
    });

    it("parses the active param, falling back to the default", () => {
      expect(urlStateConfig.parse({ active: "true" }).active).toBe(true);
      expect(urlStateConfig.parse({ active: "false" }).active).toBe(false);
      expect(urlStateConfig.parse({ active: "all" }).active).toBeNull();
      expect(urlStateConfig.parse({ active: "garbage" }).active).toBe(true);
    });

    it("clamps the page to a non-negative integer", () => {
      expect(urlStateConfig.parse({ page: "3" }).page).toBe(3);
      expect(urlStateConfig.parse({ page: "-1" }).page).toBe(0);
      expect(urlStateConfig.parse({ page: "abc" }).page).toBe(0);
    });

    it("trims free-text params", () => {
      expect(urlStateConfig.parse({ query: "  sales  " }).query).toBe("sales");
      expect(
        urlStateConfig.parse({ recipient_email: "  a@b.com  " })
          .recipient_email,
      ).toBe("a@b.com");
    });

    it("keeps only valid channels from a multi-value param", () => {
      expect(
        urlStateConfig.parse({
          channel: ["channel/email", "bogus", "channel/slack"],
        }).channel,
      ).toEqual(["channel/email", "channel/slack"]);
    });

    it("guards enum params against unknown values", () => {
      expect(urlStateConfig.parse({ tab: "failing" }).tab).toBe("failing");
      expect(urlStateConfig.parse({ tab: "bogus" }).tab).toBe("all");

      expect(urlStateConfig.parse({ sort_column: "id" }).sort_column).toBe(
        "id",
      );
      expect(urlStateConfig.parse({ sort_column: "bogus" }).sort_column).toBe(
        "last_send",
      );

      expect(
        urlStateConfig.parse({ sort_direction: "asc" }).sort_direction,
      ).toBe("asc");
      expect(
        urlStateConfig.parse({ sort_direction: "bogus" }).sort_direction,
      ).toBe("desc");

      expect(
        urlStateConfig.parse({ last_send_status: "successful" })
          .last_send_status,
      ).toBe("successful");
      expect(
        urlStateConfig.parse({ last_send_status: "bogus" }).last_send_status,
      ).toBeNull();
    });

    it("parses the creator_active tri-state", () => {
      expect(
        urlStateConfig.parse({ creator_active: "true" }).creator_active,
      ).toBe(true);
      expect(
        urlStateConfig.parse({ creator_active: "false" }).creator_active,
      ).toBe(false);
      expect(urlStateConfig.parse({}).creator_active).toBeNull();
    });
  });

  describe("urlStateConfig.serialize", () => {
    it("omits default values to keep the URL clean", () => {
      expect(urlStateConfig.serialize(DEFAULT_STATE)).toEqual({
        page: undefined,
        active: undefined,
        query: undefined,
        channel: undefined,
        last_send_status: undefined,
        creator_active: undefined,
        recipient_email: undefined,
        tab: undefined,
        sort_column: undefined,
        sort_direction: undefined,
      });
    });

    it("serializes non-default values", () => {
      expect(urlStateConfig.serialize(POPULATED_STATE)).toEqual({
        page: "2",
        active: "false",
        query: "sales",
        channel: ["channel/email", "channel/http"],
        last_send_status: "failing",
        creator_active: "false",
        recipient_email: "owner@example.com",
        tab: "failing",
        sort_column: "id",
        sort_direction: "asc",
      });
    });

    it("serializes active=null as 'all'", () => {
      expect(
        urlStateConfig.serialize({ ...DEFAULT_STATE, active: null }).active,
      ).toBe("all");
    });

    it("round-trips a fully populated state", () => {
      expect(
        urlStateConfig.parse(urlStateConfig.serialize(POPULATED_STATE)),
      ).toEqual(POPULATED_STATE);
    });
  });

  describe("buildListParams", () => {
    it("maps a default state to list params", () => {
      expect(buildListParams(DEFAULT_STATE, PAGE_SIZE)).toEqual({
        limit: PAGE_SIZE,
        offset: 0,
        active: true,
        query: undefined,
        channel: undefined,
        last_send_status: undefined,
        creatorless: undefined,
        creator_active: undefined,
        recipient_email: undefined,
        sort_column: "last_send",
        sort_direction: "desc",
      });
    });

    it("derives the offset from the page", () => {
      expect(
        buildListParams({ ...DEFAULT_STATE, page: 2 }, PAGE_SIZE).offset,
      ).toBe(2 * PAGE_SIZE);
    });

    it("maps active=null to undefined", () => {
      expect(
        buildListParams({ ...DEFAULT_STATE, active: null }, PAGE_SIZE).active,
      ).toBeUndefined();
    });

    it("filters the failing tab on run health (last_check), not delivery (last_send)", () => {
      const params = buildListParams(
        { ...DEFAULT_STATE, tab: "failing" },
        PAGE_SIZE,
      );
      expect(params.last_check_status).toBe("failing");
      expect(params.last_send_status).toBeUndefined();
    });

    it("pins creatorless on the ownerless tab and suppresses creator_active", () => {
      const params = buildListParams(
        { ...DEFAULT_STATE, tab: "ownerless", creator_active: true },
        PAGE_SIZE,
      );
      expect(params.creatorless).toBe(true);
      expect(params.creator_active).toBeUndefined();
    });

    it("passes filter values through on the all tab", () => {
      const params = buildListParams(
        {
          ...DEFAULT_STATE,
          last_send_status: "successful",
          creator_active: false,
          channel: ["channel/slack"],
          query: "weekly",
          recipient_email: "a@b.com",
        },
        PAGE_SIZE,
      );
      expect(params).toMatchObject({
        last_send_status: "successful",
        creator_active: false,
        channel: ["channel/slack"],
        query: "weekly",
        recipient_email: "a@b.com",
      });
      expect(params.creatorless).toBeUndefined();
    });
  });

  describe("getChannelLabel / getChannelIconName", () => {
    const cases: [NotificationChannelType, string, string][] = [
      ["channel/email", "Email", "mail"],
      ["channel/slack", "Slack", "slack"],
      ["channel/http", "Webhook", "webhook"],
    ];

    it.each(cases)("maps %s to its label and icon", (channel, label, icon) => {
      expect(getChannelLabel(channel)).toBe(label);
      expect(getChannelIconName(channel)).toBe(icon);
    });
  });

  describe("formatRelativeDate", () => {
    it("returns 'Never' for empty values", () => {
      expect(formatRelativeDate(null)).toBe("Never");
      expect(formatRelativeDate(undefined)).toBe("Never");
      expect(formatRelativeDate("")).toBe("Never");
    });

    it("prefixes same-day timestamps with 'Today'", () => {
      const value = dayjs().hour(9).minute(30).second(0).toISOString();
      expect(formatRelativeDate(value).startsWith("Today,")).toBe(true);
    });

    it("prefixes yesterday's timestamps with 'Yesterday'", () => {
      const value = dayjs()
        .subtract(1, "day")
        .hour(9)
        .minute(30)
        .second(0)
        .toISOString();
      expect(formatRelativeDate(value).startsWith("Yesterday,")).toBe(true);
    });

    it("formats older timestamps as an absolute date", () => {
      const value = dayjs().subtract(10, "day").toISOString();
      expect(formatRelativeDate(value)).toBe(dayjs(value).format("MMM D, LT"));
    });
  });
});
