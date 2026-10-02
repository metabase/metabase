import { PAGE_SIZE } from "./constants";
import type { OAuthClientsUrlState } from "./types";
import { buildListParams, urlStateConfig } from "./utils";

const DEFAULT_STATE: OAuthClientsUrlState = {
  page: 0,
  tab: "active",
};

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
  });

  describe("urlStateConfig.serialize", () => {
    it("omits every param at its default", () => {
      expect(urlStateConfig.serialize(DEFAULT_STATE)).toEqual({
        page: undefined,
        tab: undefined,
      });
    });

    it("writes the tab and page that differ from the default", () => {
      expect(urlStateConfig.serialize({ page: 2, tab: "revoked" })).toEqual({
        page: "2",
        tab: "revoked",
      });
    });

    it("round-trips a populated state", () => {
      const state: OAuthClientsUrlState = { page: 4, tab: "revoked" };
      expect(urlStateConfig.parse(urlStateConfig.serialize(state))).toEqual(
        state,
      );
    });
  });

  describe("buildListParams", () => {
    it("asks for the active clients on the first page", () => {
      expect(buildListParams(DEFAULT_STATE, PAGE_SIZE)).toEqual({
        limit: PAGE_SIZE,
        offset: 0,
        status: "active",
      });
    });

    it("asks for the revoked clients, offset by the page", () => {
      expect(buildListParams({ page: 2, tab: "revoked" }, PAGE_SIZE)).toEqual({
        limit: PAGE_SIZE,
        offset: 2 * PAGE_SIZE,
        status: "revoked",
      });
    });
  });
});
