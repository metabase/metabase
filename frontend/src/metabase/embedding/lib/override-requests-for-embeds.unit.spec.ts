import { api } from "metabase/api/client";
import { isEmbedPreview } from "metabase/embedding/config";

import {
  matchUrlPattern,
  overrideRequests,
  rewriteEmbedPreviewUrl,
  setupEmbedPreviewRewrite,
} from "./override-requests-for-embeds";

jest.mock("metabase/embedding/config", () => ({
  isEmbedPreview: jest.fn(),
}));

const mockIsEmbedPreview = jest.mocked(isEmbedPreview);

afterEach(() => {
  mockIsEmbedPreview.mockReset();
});

describe("matchUrlPattern", () => {
  it("should match URL with single parameter", () => {
    expect(
      matchUrlPattern("/api/card/:cardId/query", "/api/card/123/query"),
    ).toBe(true);
  });

  it("should not match URL with different path structure", () => {
    expect(
      matchUrlPattern("/api/card/:cardId/query", "/api/card/123/edit"),
    ).toBe(false);
  });

  it("should match URL with multiple parameters", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/values",
        "/api/card/123/params/456/values",
      ),
    ).toBe(true);
  });

  it("should match card query pattern", () => {
    expect(
      matchUrlPattern("/api/card/:cardId/query", "/api/card/1/query"),
    ).toBe(true);
  });

  it("should match card pivot query pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/pivot/:cardId/query",
        "/api/card/pivot/123/query",
      ),
    ).toBe(true);
  });

  it("should match card parameter values pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/values",
        "/api/card/123/params/456/values",
      ),
    ).toBe(true);
  });

  it("should match card parameter search pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/search/:query",
        "/api/card/123/params/456/search/test",
      ),
    ).toBe(true);
  });

  it("should match card parameter remapping pattern", () => {
    expect(
      matchUrlPattern(
        "/api/card/:cardId/params/:paramId/remapping",
        "/api/card/123/params/456/remapping",
      ),
    ).toBe(true);
  });

  it("should match dashboard parameter values pattern", () => {
    expect(
      matchUrlPattern(
        "/api/dashboard/:dashId/params/:paramId/values",
        "/api/dashboard/789/params/456/values",
      ),
    ).toBe(true);
  });

  it("should match dashboard parameter search pattern", () => {
    expect(
      matchUrlPattern(
        "/api/dashboard/:dashId/params/:paramId/search/:query",
        "/api/dashboard/789/params/456/search/test",
      ),
    ).toBe(true);
  });

  it("should match dashboard parameter remapping pattern", () => {
    expect(
      matchUrlPattern(
        "/api/dashboard/:dashId/params/:paramId/remapping",
        "/api/dashboard/789/params/456/remapping",
      ),
    ).toBe(true);
  });
});

describe("overrideRequests", () => {
  it.each(["guest", "static", "public"] as const)(
    "leaves /api/frontend-errors untouched in %s embed mode",
    async (embedType) => {
      const result = await overrideRequests({
        embedType,
        method: "POST",
        url: "/api/frontend-errors",
        data: { type: "component-crash" },
      });

      expect(result.url).toBe("/api/frontend-errors");
      expect(result.method).toBe("POST");
    },
  );

  it("still applies the default /api → /api/embed rewrite to passthrough endpoints", async () => {
    const result = await overrideRequests({
      embedType: "guest",
      method: "GET",
      url: "/api/card/THE_JWT_TOKEN",
      data: {},
    });

    expect(result.url).toBe("/api/embed/card/THE_JWT_TOKEN");
  });

  it("still applies explicit transformations (card query → embed card query)", async () => {
    const result = await overrideRequests({
      embedType: "guest",
      method: "POST",
      url: "/api/card/123/query",
      data: {},
    });

    expect(result.url).toBe("/api/embed/card/:token/query");
    expect(result.method).toBe("GET");
  });
});

describe("setupEmbedPreviewRewrite", () => {
  // The embed route registers `usePublicEndpoints` on a parent of the dashboard
  // fetcher, and React runs child effects before parent effects, so this must be
  // called synchronously (not from an effect) to catch the first embed request.
  it("registers rewriteEmbedPreviewUrl on the shared client, idempotently", () => {
    const before = api.beforeRequestHandlers.filter(
      (handler) => handler === rewriteEmbedPreviewUrl,
    ).length;

    expect(before).toBe(0);

    setupEmbedPreviewRewrite();
    setupEmbedPreviewRewrite();

    const after = api.beforeRequestHandlers.filter(
      (handler) => handler === rewriteEmbedPreviewUrl,
    ).length;

    expect(after).toBe(1);
  });
});

describe("rewriteEmbedPreviewUrl", () => {
  it("rewrites the embed base to the preview base inside an embed preview", async () => {
    mockIsEmbedPreview.mockReturnValue(true);

    const result = await rewriteEmbedPreviewUrl({
      method: "GET",
      url: "/api/embed/card/THE_TOKEN/query",
      data: {},
    });

    expect(result).toEqual({ url: "/api/preview_embed/card/THE_TOKEN/query" });
  });

  it("leaves the url untouched outside an embed preview", async () => {
    mockIsEmbedPreview.mockReturnValue(false);

    const result = await rewriteEmbedPreviewUrl({
      method: "GET",
      url: "/api/embed/card/THE_TOKEN/query",
      data: {},
    });

    expect(result).toBeUndefined();
  });

  it("leaves non-embed urls untouched inside an embed preview", async () => {
    mockIsEmbedPreview.mockReturnValue(true);

    const result = await rewriteEmbedPreviewUrl({
      method: "GET",
      url: "/api/card/1/query",
      data: {},
    });

    expect(result).toBeUndefined();
  });
});
