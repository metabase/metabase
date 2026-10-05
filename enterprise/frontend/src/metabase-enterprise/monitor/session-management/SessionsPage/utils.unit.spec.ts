import { PAGE_SIZE } from "./constants";
import type { SessionsUrlState } from "./types";
import { buildListParams, urlStateConfig } from "./utils";

const DEFAULT_STATE: SessionsUrlState = {
  page: 0,
  query: "",
  tab: "active",
  provider: [],
  last_active: null,
  ended: null,
  reason: null,
  sort_column: "created_at",
  sort_direction: "desc",
};

const POPULATED_STATE: SessionsUrlState = {
  page: 2,
  query: "ann",
  tab: "ended",
  provider: ["saml", "jwt"],
  last_active: "day",
  ended: "week",
  reason: "admin",
  sort_column: "user_email",
  sort_direction: "asc",
};

const LAST_ACTIVE_AFTER = "2026-10-04T12:00:00.000Z";
const ENDED_AFTER = "2026-09-28T12:00:00.000Z";

describe("SessionsPage/utils", () => {
  describe("urlStateConfig.parse", () => {
    it("returns defaults for an empty query", () => {
      expect(urlStateConfig.parse({})).toEqual(DEFAULT_STATE);
    });

    it("trims the search query", () => {
      expect(urlStateConfig.parse({ query: "  ann  " }).query).toBe("ann");
    });

    it("keeps only known auth methods, so an unknown one can't fail the whole request", () => {
      expect(
        urlStateConfig.parse({ provider: ["saml", "mcp", "jwt"] }).provider,
      ).toEqual(["saml", "jwt"]);
      expect(urlStateConfig.parse({ provider: "saml" }).provider).toEqual([
        "saml",
      ]);
    });

    it("guards the tab, time preset and reason params against unknown values", () => {
      expect(urlStateConfig.parse({ tab: "ended" }).tab).toBe("ended");
      expect(urlStateConfig.parse({ tab: "bogus" }).tab).toBe("active");

      expect(urlStateConfig.parse({ last_active: "week" }).last_active).toBe(
        "week",
      );
      expect(urlStateConfig.parse({ ended: "decade" }).ended).toBeNull();

      expect(urlStateConfig.parse({ reason: "logout" }).reason).toBe("logout");
      expect(urlStateConfig.parse({ reason: "boredom" }).reason).toBeNull();
    });

    it("only sorts by the columns the table offers", () => {
      expect(
        urlStateConfig.parse({ sort_column: "provider" }).sort_column,
      ).toBe("provider");
      expect(
        urlStateConfig.parse({ sort_column: "last_active_at" }).sort_column,
      ).toBe("created_at");
    });
  });

  describe("urlStateConfig.serialize", () => {
    it("leaves defaults out of the URL", () => {
      expect(
        Object.values(urlStateConfig.serialize(DEFAULT_STATE)).filter(
          (value) => value !== undefined,
        ),
      ).toEqual([]);
    });

    it("round-trips a populated state", () => {
      expect(
        urlStateConfig.parse(urlStateConfig.serialize(POPULATED_STATE)),
      ).toEqual(POPULATED_STATE);
    });
  });

  describe("buildListParams", () => {
    it("sends only the active tab's filters", () => {
      const state = { ...POPULATED_STATE, tab: "active" as const };

      expect(
        buildListParams(state, PAGE_SIZE, LAST_ACTIVE_AFTER, ENDED_AFTER),
      ).toMatchObject({
        status: "live",
        "last-active-after": LAST_ACTIVE_AFTER,
        "ended-after": undefined,
        reason: undefined,
      });
    });

    it("sends only the ended tab's filters", () => {
      expect(
        buildListParams(
          POPULATED_STATE,
          PAGE_SIZE,
          LAST_ACTIVE_AFTER,
          ENDED_AFTER,
        ),
      ).toMatchObject({
        status: "ended",
        "last-active-after": undefined,
        "ended-after": ENDED_AFTER,
        reason: "admin",
      });
    });

    it("leaves out an empty search and an empty auth method list", () => {
      const params = buildListParams(
        DEFAULT_STATE,
        PAGE_SIZE,
        undefined,
        undefined,
      );

      expect(params.query).toBeUndefined();
      expect(params.provider).toBeUndefined();
    });
  });
});
