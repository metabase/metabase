import { createMockOAuthClient } from "metabase-types/api/mocks";

import { PAGE_SIZE } from "./constants";
import type { OAuthClientsUrlState } from "./types";
import {
  buildListParams,
  getTabChange,
  isOAuthClientRevokedBy,
  urlStateConfig,
} from "./utils";

const DEFAULT_STATE: OAuthClientsUrlState = {
  page: 0,
  query: "",
  tab: "active",
  registered: null,
  user: null,
  sort_column: "created_at",
  sort_direction: "desc",
};

const REGISTERED_AFTER = "2026-09-25T00:00:00.000Z";

describe("OAuthClientsPage/utils", () => {
  describe("urlStateConfig.parse", () => {
    it("returns defaults for an empty query", () => {
      expect(urlStateConfig.parse({})).toEqual(DEFAULT_STATE);
    });

    it("parses the tab, falling back to Active", () => {
      expect(urlStateConfig.parse({ tab: "revoked" }).tab).toBe("revoked");
      expect(urlStateConfig.parse({ tab: "active" }).tab).toBe("active");
      expect(urlStateConfig.parse({ tab: "garbage" }).tab).toBe("active");
    });

    it("clamps the page to a non-negative integer", () => {
      expect(urlStateConfig.parse({ page: "3" }).page).toBe(3);
      expect(urlStateConfig.parse({ page: "-1" }).page).toBe(0);
      expect(urlStateConfig.parse({ page: "abc" }).page).toBe(0);
    });

    it("trims the search, and reads a missing one as searching for nothing", () => {
      expect(urlStateConfig.parse({ query: "  claude  " }).query).toBe(
        "claude",
      );
      expect(urlStateConfig.parse({}).query).toBe("");
    });

    it("parses the registered preset, dropping one the endpoint has no window for", () => {
      expect(urlStateConfig.parse({ registered: "week" }).registered).toBe(
        "week",
      );
      expect(urlStateConfig.parse({ registered: "fortnight" }).registered).toBe(
        null,
      );
    });

    it("parses the user filter as an id, dropping anything that is not one", () => {
      expect(urlStateConfig.parse({ user: "42" }).user).toBe(42);
      expect(urlStateConfig.parse({ user: "rasta" }).user).toBe(null);
      expect(urlStateConfig.parse({ user: "0" }).user).toBe(null);
      expect(urlStateConfig.parse({ user: "-3" }).user).toBe(null);
    });

    it("parses the sort, falling back to newest registration first", () => {
      expect(
        urlStateConfig.parse({
          sort_column: "live_tokens",
          sort_direction: "asc",
        }),
      ).toMatchObject({ sort_column: "live_tokens", sort_direction: "asc" });
      expect(
        urlStateConfig.parse({
          sort_column: "client_secret_hash",
          sort_direction: "sideways",
        }),
      ).toMatchObject({ sort_column: "created_at", sort_direction: "desc" });
    });
  });

  describe("urlStateConfig.serialize", () => {
    it("omits every param at its default, so a pristine page has a clean URL", () => {
      expect(urlStateConfig.serialize(DEFAULT_STATE)).toEqual({
        page: undefined,
        query: undefined,
        tab: undefined,
        registered: undefined,
        user: undefined,
        sort_column: undefined,
        sort_direction: undefined,
      });
    });

    it("writes each param that differs from the default", () => {
      expect(
        urlStateConfig.serialize({
          page: 2,
          query: "claude",
          tab: "revoked",
          registered: "day",
          user: 7,
          sort_column: "user_count",
          sort_direction: "asc",
        }),
      ).toEqual({
        page: "2",
        query: "claude",
        tab: "revoked",
        registered: "day",
        user: "7",
        sort_column: "user_count",
        sort_direction: "asc",
      });
    });

    it("round-trips a populated state", () => {
      const state: OAuthClientsUrlState = {
        page: 4,
        query: "reporting bot",
        tab: "revoked",
        registered: "month",
        user: 12,
        sort_column: "client_name",
        sort_direction: "asc",
      };
      expect(urlStateConfig.parse(urlStateConfig.serialize(state))).toEqual(
        state,
      );
    });
  });

  describe("buildListParams", () => {
    it("asks for the active clients on the first page, newest first", () => {
      expect(buildListParams(DEFAULT_STATE, PAGE_SIZE, undefined)).toEqual({
        limit: PAGE_SIZE,
        offset: 0,
        status: "active",
        query: undefined,
        "user-id": undefined,
        "registered-after": undefined,
        "sort-column": "created_at",
        "sort-direction": "desc",
      });
    });

    it("asks for the revoked clients, offset by the page", () => {
      expect(
        buildListParams(
          { ...DEFAULT_STATE, page: 2, tab: "revoked" },
          PAGE_SIZE,
          undefined,
        ),
      ).toMatchObject({ status: "revoked", offset: 2 * PAGE_SIZE });
    });

    it("sends the search, the user and the registered window as the endpoint's filters", () => {
      expect(
        buildListParams(
          { ...DEFAULT_STATE, query: "claude", user: 7, registered: "week" },
          PAGE_SIZE,
          REGISTERED_AFTER,
        ),
      ).toMatchObject({
        query: "claude",
        "user-id": 7,
        "registered-after": REGISTERED_AFTER,
      });
    });

    it("keeps the registered window on the Revoked tab, where a revoked client still has a registration", () => {
      expect(
        buildListParams(
          { ...DEFAULT_STATE, tab: "revoked", registered: "week" },
          PAGE_SIZE,
          REGISTERED_AFTER,
        ),
      ).toMatchObject({
        status: "revoked",
        "registered-after": REGISTERED_AFTER,
      });
    });

    it("drops the user filter on the Revoked tab, where an unrevoked token can never match", () => {
      expect(
        buildListParams(
          { ...DEFAULT_STATE, tab: "revoked", user: 7 },
          PAGE_SIZE,
          undefined,
        ),
      ).toMatchObject({ status: "revoked", "user-id": undefined });
    });

    it("omits a blank search, which the endpoint rejects", () => {
      expect(
        buildListParams({ ...DEFAULT_STATE, query: "" }, PAGE_SIZE, undefined),
      ).toMatchObject({ query: undefined });
    });

    it("sends the sort the headers put in the URL", () => {
      expect(
        buildListParams(
          {
            ...DEFAULT_STATE,
            sort_column: "live_tokens",
            sort_direction: "asc",
          },
          PAGE_SIZE,
          undefined,
        ),
      ).toMatchObject({
        "sort-column": "live_tokens",
        "sort-direction": "asc",
      });
    });
  });

  describe("getTabChange", () => {
    it("goes back to the first page, keeping a sort the new tab shows", () => {
      expect(
        getTabChange(
          { ...DEFAULT_STATE, page: 3, sort_column: "client_name" },
          "revoked",
        ),
      ).toEqual({ tab: "revoked", page: 0 });
    });

    it("resets a sort by a column the new tab doesn't show", () => {
      expect(
        getTabChange(
          {
            ...DEFAULT_STATE,
            sort_column: "live_tokens",
            sort_direction: "asc",
          },
          "revoked",
        ),
      ).toEqual({
        tab: "revoked",
        page: 0,
        sort_column: "created_at",
        sort_direction: "desc",
      });
    });

    it("resets a Revoked-only sort on the way back to Active", () => {
      expect(
        getTabChange(
          { ...DEFAULT_STATE, tab: "revoked", sort_column: "revoked_at" },
          "active",
        ),
      ).toEqual({
        tab: "active",
        page: 0,
        sort_column: "created_at",
        sort_direction: "desc",
      });
    });
  });

  describe("isOAuthClientRevokedBy", () => {
    const client = createMockOAuthClient({ client_id: "shown" });

    it.each([
      { description: "revoking everything", request: {}, expected: true },
      {
        description: "revoking its id",
        request: { ids: ["shown"] },
        expected: true,
      },
      {
        description: "revoking other ids",
        request: { ids: ["other"] },
        expected: false,
      },
      {
        // the row does not say who holds its tokens, so this counts as a hit
        description: "revoking by a user it may hold a token for",
        request: { "user-id": 3 },
        expected: true,
      },
    ])(
      "is $expected for an active client when $description",
      ({ request, expected }) => {
        expect(isOAuthClientRevokedBy(client, request)).toBe(expected);
      },
    );

    it("is false for a revoked or current client, whatever the criteria", () => {
      expect(isOAuthClientRevokedBy({ ...client, status: "revoked" }, {})).toBe(
        false,
      );
      expect(isOAuthClientRevokedBy({ ...client, current: true }, {})).toBe(
        false,
      );
    });
  });
});
